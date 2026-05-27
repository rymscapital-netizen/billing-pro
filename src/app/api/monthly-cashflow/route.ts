import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

const toNumber = (value: unknown) => Number(value ?? 0)

function parseMonth(value: string | null) {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const yearMonth = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback
  const [year, month] = yearMonth.split("-").map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { yearMonth, start, end }
}

function normalizeCompanyName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "")
    .replace(/株式会社|有限会社|合同会社|一般社団法人|（株）|\(株\)|㈱/g, "")
    .toLowerCase()
}

function buildBankText(vendorName: string, bank: any) {
  const lines = [
    vendorName,
    [bank?.bankName, bank?.bankBranch].filter(Boolean).join(" "),
    [bank?.bankAccountType, bank?.bankAccountNumber].filter(Boolean).join(" "),
    bank?.bankAccountHolder,
    bank?.bankAccountMemo,
  ].filter(Boolean)
  return lines.join("\n")
}

function groupByName(items: any[], nameKey: "vendorName" | "companyName") {
  const map = new Map<string, any>()
  for (const item of items) {
    const name = item[nameKey] || "未設定"
    const current = map.get(name) ?? {
      name,
      total: 0,
      paid: 0,
      unpaid: 0,
      confirmed: 0,
      unconfirmed: 0,
      count: 0,
      unpaidCount: 0,
      items: [],
    }
    current.total += item.amount
    current.count += 1
    current.items.push(item)
    if (item.status === "PAID" || item.status === "PAYMENT_CONFIRMED" || item.status === "CLEARED") {
      current.paid += item.amount
      current.confirmed += item.amount
    } else {
      current.unpaid += item.amount
      current.unconfirmed += item.amount
      current.unpaidCount += 1
    }
    map.set(name, current)
  }
  return Array.from(map.values()).sort((a, b) => b.unpaid - a.unpaid || b.total - a.total)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canViewInternalReports(session.user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const { yearMonth, start, end } = parseMonth(searchParams.get("yearMonth"))
    const companyId = session.user.companyId
    const sb = getSupabase()

    const [
      receivedResult,
      companyResult,
      issuedResult,
    ] = await Promise.all([
      sb.from("ReceivedInvoice")
        .select("id, invoiceNumber, vendorName, subject, issueDate, dueDate, amount, status, paidAt")
        .eq("ownerCompanyId", companyId)
        .gte("dueDate", start.toISOString())
        .lte("dueDate", end.toISOString())
        .order("dueDate", { ascending: true }),
      sb.from("Company")
        .select("id, name, bankName, bankBranch, bankAccountType, bankAccountNumber, bankAccountHolder, bankAccountMemo")
        .eq("type", "CLIENT")
        .eq("isActive", true)
        .or(`createdByCompanyId.eq.${companyId},createdByCompanyId.is.null`),
      sb.from("Invoice")
        .select("id, invoiceNumber, subject, issueDate, dueDate, amount, status, company:Company!companyId(id, name)")
        .eq("issuerCompanyId", companyId)
        .neq("status", "DRAFT")
        .gte("dueDate", start.toISOString())
        .lte("dueDate", end.toISOString())
        .order("dueDate", { ascending: true }),
    ])

    if (receivedResult.error) throw new Error(`received: ${receivedResult.error.message}`)
    if (companyResult.error) throw new Error(`companies: ${companyResult.error.message}`)
    if (issuedResult.error) throw new Error(`issued: ${issuedResult.error.message}`)

    const companies = companyResult.data ?? []
    const companyByExact = new Map(companies.map((c: any) => [c.name, c]))
    const companyByNormalized = new Map(companies.map((c: any) => [normalizeCompanyName(c.name), c]))

    const outgoingItems = (receivedResult.data ?? []).map((row: any) => {
      const matchedCompany =
        companyByExact.get(row.vendorName) ??
        companyByNormalized.get(normalizeCompanyName(row.vendorName)) ??
        null
      const amount = toNumber(row.amount)
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        vendorName: row.vendorName,
        subject: row.subject,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        amount,
        status: row.status,
        paidAt: row.paidAt,
        bank: matchedCompany ? {
          companyId: matchedCompany.id,
          bankName: matchedCompany.bankName,
          bankBranch: matchedCompany.bankBranch,
          bankAccountType: matchedCompany.bankAccountType,
          bankAccountNumber: matchedCompany.bankAccountNumber,
          bankAccountHolder: matchedCompany.bankAccountHolder,
          bankAccountMemo: matchedCompany.bankAccountMemo,
          copyText: buildBankText(row.vendorName, matchedCompany),
        } : null,
      }
    })

    const incomingItems = (issuedResult.data ?? []).map((row: any) => {
      const company = Array.isArray(row.company) ? row.company[0] : row.company
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        companyName: company?.name ?? "未設定",
        subject: row.subject,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        amount: toNumber(row.amount),
        status: row.status,
      }
    })

    const outgoingTotal = outgoingItems.reduce((sum, item) => sum + item.amount, 0)
    const outgoingPaid = outgoingItems
      .filter(item => item.status === "PAID")
      .reduce((sum, item) => sum + item.amount, 0)
    const incomingTotal = incomingItems.reduce((sum, item) => sum + item.amount, 0)
    const incomingConfirmed = incomingItems
      .filter(item => ["PAYMENT_CONFIRMED", "CLEARED"].includes(item.status))
      .reduce((sum, item) => sum + item.amount, 0)

    const outgoingGroups = groupByName(outgoingItems, "vendorName").map(group => ({
      ...group,
      bank: group.items.find((item: any) => item.bank)?.bank ?? null,
    }))
    const incomingGroups = groupByName(incomingItems, "companyName")

    return NextResponse.json({
      month: yearMonth,
      incoming: {
        total: incomingTotal,
        confirmed: incomingConfirmed,
        unconfirmed: incomingTotal - incomingConfirmed,
        companyCount: incomingGroups.length,
        invoiceCount: incomingItems.length,
        groups: incomingGroups,
      },
      outgoing: {
        total: outgoingTotal,
        paid: outgoingPaid,
        unpaid: outgoingTotal - outgoingPaid,
        vendorCount: outgoingGroups.length,
        invoiceCount: outgoingItems.length,
        unpaidCount: outgoingItems.filter(item => item.status === "UNPAID").length,
        groups: outgoingGroups,
      },
    })
  } catch (e: any) {
    console.error("[monthly-cashflow ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
