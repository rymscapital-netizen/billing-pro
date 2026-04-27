import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const FREEE_STATUS_MAP: Record<string, string> = {
  draft:     "DRAFT",
  issue:     "ISSUED",
  sending:   "ISSUED",
  uncleared: "PENDING",
  cleared:   "CLEARED",
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  const accessToken = req.cookies.get("freee_access_token")?.value
  const companyId   = req.cookies.get("freee_company_id")?.value

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: "freee未連携" }, { status: 401 })
  }

  const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
  const freeeRes = await fetch(`https://api.freee.co.jp/api/1/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!freeeRes.ok) {
    const err = await freeeRes.text()
    return NextResponse.json({ error: "freee APIエラー", detail: err }, { status: 502 })
  }

  const { invoices: freeeInvoices } = await freeeRes.json()
  if (!Array.isArray(freeeInvoices)) {
    return NextResponse.json({ error: "データなし" }, { status: 502 })
  }

  // 自社（ADMIN会社）を取得
  const adminCompany = await prisma.company.findFirst({ where: { type: "ADMIN" } })
  if (!adminCompany) {
    return NextResponse.json({ error: "自社情報が未登録" }, { status: 500 })
  }

  let created = 0
  let skipped = 0

  for (const fi of freeeInvoices) {
    const invoiceNumber = fi.invoice_number || `FREEE-${fi.id}`

    // 既存チェック
    const exists = await prisma.invoice.findUnique({ where: { invoiceNumber } })
    if (exists) { skipped++; continue }

    // 取引先会社を取得 or 作成
    const partnerName: string = fi.partner_name || "不明"
    let company = await prisma.company.findFirst({ where: { name: partnerName } })
    if (!company) {
      company = await prisma.company.create({
        data: { name: partnerName, type: "CLIENT" },
      })
    }

    const subtotal  = fi.sub_total       ?? 0
    const tax       = fi.tax_amount      ?? 0
    const amount    = fi.total_amount    ?? subtotal + tax
    const status    = FREEE_STATUS_MAP[fi.invoice_status] ?? "DRAFT"
    const issueDate = fi.invoice_date ? new Date(fi.invoice_date) : new Date()
    const dueDate   = fi.due_date       ? new Date(fi.due_date)   : new Date()

    await prisma.invoice.create({
      data: {
        invoiceNumber,
        companyId:      company.id,
        issuerCompanyId: adminCompany.id,
        subject:        fi.title || "（タイトルなし）",
        issueDate,
        dueDate,
        subtotal,
        tax,
        amount,
        status: status as any,
        payments: {
          create: {
            paymentStatus: status === "CLEARED" ? "CONFIRMED" : "UNPAID",
            clearStatus:   status === "CLEARED" ? "CLEARED"   : "UNCLEARED",
          },
        },
      },
    })
    created++
  }

  return NextResponse.json({ ok: true, created, skipped, total: freeeInvoices.length })
}
