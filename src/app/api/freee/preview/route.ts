import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
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
  const freeeRes = await fetch(`https://api.freee.co.jp/iv/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!freeeRes.ok) {
    const err = await freeeRes.text()
    return NextResponse.json({ error: "freee APIエラー", detail: err }, { status: 502 })
  }

  const body = await freeeRes.json()
  const invoices = body.invoices ?? body
  if (!Array.isArray(invoices)) {
    return NextResponse.json({ error: "データなし", raw: body }, { status: 502 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const issuerCompanyId = (session.user as any).companyId
  const freeeIds = invoices.map((fi: any) => String(fi.id))
  const { data: importedRows, error: importedError } = await sb.from("Invoice")
    .select("sourceId")
    .eq("source", "freee")
    .eq("issuerCompanyId", issuerCompanyId)
    .in("sourceId", freeeIds)

  if (importedError) {
    return NextResponse.json({ error: "取込状況の確認に失敗しました" }, { status: 500 })
  }
  const importedIds = new Set((importedRows ?? []).map(row => String(row.sourceId)))

  const result = invoices.map((fi: any) => ({
    freeeId:       String(fi.id),
    invoiceNumber: fi.invoice_number || `FREEE-${fi.id}`,
    partnerName:   fi.partner_name   || "不明",
    title:         fi.subject        || "（タイトルなし）",
    invoiceDate:   fi.billing_date   || null,
    dueDate:       fi.payment_date   || null,
    totalAmount:   fi.total_amount   ?? 0,
    status:        fi.payment_status ?? "unsettled",
    imported:      importedIds.has(String(fi.id)),
  }))

  return NextResponse.json(result)
}
