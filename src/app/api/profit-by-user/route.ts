import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function parseMonth(value: string | null) {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const yearMonth = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback
  const [year, month] = yearMonth.split("-").map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { yearMonth, start, end }
}

const toNumber = (value: unknown) => Number(value ?? 0)

function groupInvoices(rows: any[]) {
  const groups = new Map<string, any>()

  for (const row of rows) {
    const assignedUser = Array.isArray(row.assignedUser) ? row.assignedUser[0] : row.assignedUser
    const company = Array.isArray(row.company) ? row.company[0] : row.company
    const profit = Array.isArray(row.profit) ? row.profit[0] : row.profit
    const payments = Array.isArray(row.payments) ? row.payments : []

    const userId = assignedUser?.id ?? "unassigned"
    const userName = assignedUser?.name ?? "未設定"
    const sales = profit ? toNumber(profit.sales) : toNumber(row.subtotal)
    const cost = profit ? toNumber(profit.cost) : 0
    const grossProfit = profit ? toNumber(profit.grossProfit) : sales - cost
    const amount = toNumber(row.amount)
    const confirmedAmount = ["PAYMENT_CONFIRMED", "CLEARED"].includes(row.status)
      ? amount
      : payments
          .filter((payment: any) => payment.paymentStatus === "CONFIRMED")
          .reduce((sum: number, payment: any) => sum + toNumber(payment.paymentAmount), 0)

    const current = groups.get(userId) ?? {
      userId,
      userName,
      sales: 0,
      cost: 0,
      grossProfit: 0,
      amount: 0,
      confirmedAmount: 0,
      unconfirmedAmount: 0,
      invoiceCount: 0,
      missingProfitCount: 0,
      items: [],
    }

    current.sales += sales
    current.cost += cost
    current.grossProfit += grossProfit
    current.amount += amount
    current.confirmedAmount += confirmedAmount
    current.unconfirmedAmount += Math.max(amount - confirmedAmount, 0)
    current.invoiceCount += 1
    if (!profit) current.missingProfitCount += 1
    current.items.push({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      companyName: company?.name ?? "未設定",
      subject: row.subject,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      sales,
      cost,
      grossProfit,
      amount,
      status: row.status,
      hasProfit: Boolean(profit),
    })

    groups.set(userId, current)
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      profitRate: group.sales > 0 ? (group.grossProfit / group.sales) * 100 : 0,
      items: group.items.sort((a: any, b: any) => String(b.issueDate).localeCompare(String(a.issueDate))),
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { yearMonth, start, end } = parseMonth(searchParams.get("yearMonth"))
    const assignedUserId = searchParams.get("assignedUserId")
    const sb = getSupabase()

    let query = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUser:User!assignedUserId(id, name), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("issueDate", start.toISOString())
      .lte("issueDate", end.toISOString())
      .order("issueDate", { ascending: false })

    if (assignedUserId) query = query.eq("assignedUserId", assignedUserId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const groups = groupInvoices(data ?? [])
    const totals = groups.reduce((sum, group) => ({
      sales: sum.sales + group.sales,
      cost: sum.cost + group.cost,
      grossProfit: sum.grossProfit + group.grossProfit,
      amount: sum.amount + group.amount,
      confirmedAmount: sum.confirmedAmount + group.confirmedAmount,
      unconfirmedAmount: sum.unconfirmedAmount + group.unconfirmedAmount,
      invoiceCount: sum.invoiceCount + group.invoiceCount,
      missingProfitCount: sum.missingProfitCount + group.missingProfitCount,
    }), {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      amount: 0,
      confirmedAmount: 0,
      unconfirmedAmount: 0,
      invoiceCount: 0,
      missingProfitCount: 0,
    })

    return NextResponse.json({
      month: yearMonth,
      totals: {
        ...totals,
        profitRate: totals.sales > 0 ? (totals.grossProfit / totals.sales) * 100 : 0,
      },
      groups,
    })
  } catch (e: any) {
    console.error("[profit-by-user ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
