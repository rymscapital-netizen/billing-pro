import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const FREEE_STATUS_MAP: Record<string, string> = {
  settled:   "CLEARED",
  unsettled: "PENDING",
  canceled:  "DRAFT",
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

  const { selectedIds }: { selectedIds: string[] } = await req.json()
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return NextResponse.json({ error: "取り込む請求書を選択してください" }, { status: 400 })
  }

  const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
  const freeeRes = await fetch(`https://api.freee.co.jp/iv/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!freeeRes.ok) {
    return NextResponse.json({ error: "freee APIエラー" }, { status: 502 })
  }

  const body = await freeeRes.json()
  const freeeInvoices = body.invoices ?? body
  if (!Array.isArray(freeeInvoices)) {
    return NextResponse.json({ error: "データなし" }, { status: 502 })
  }

  const targets = freeeInvoices.filter((fi: any) => selectedIds.includes(String(fi.id)))

  const adminCompany = await prisma.company.findFirst({ where: { type: "ADMIN" } })
  if (!adminCompany) {
    return NextResponse.json({ error: "自社情報が未登録" }, { status: 500 })
  }

  let created = 0
  let skipped = 0

  for (const fi of targets) {
    const invoiceNumber = fi.invoice_number || `FREEE-${fi.id}`

    const exists = await prisma.invoice.findUnique({ where: { invoiceNumber } })
    if (exists) { skipped++; continue }

    const partnerName: string = fi.partner_name || "不明"
    let company = await prisma.company.findFirst({ where: { name: partnerName } })
    if (!company) {
      company = await prisma.company.create({
        data: { name: partnerName, type: "CLIENT" },
      })
    }

    const amount    = fi.total_amount ?? 0
    const tax       = fi.amount_tax   ?? 0
    const subtotal  = amount - tax
    const status    = FREEE_STATUS_MAP[fi.payment_status] ?? "ISSUED"
    const issueDate = fi.billing_date  ? new Date(fi.billing_date)  : new Date()
    const dueDate   = fi.payment_date  ? new Date(fi.payment_date)  : new Date()

    await prisma.invoice.create({
      data: {
        invoiceNumber,
        companyId:       company.id,
        issuerCompanyId: adminCompany.id,
        subject:         fi.subject || "（タイトルなし）",
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

  return NextResponse.json({ ok: true, created, skipped, total: targets.length })
}
