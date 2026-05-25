import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const totalAmount = (request: any) => {
  if (request.total_amount != null) return Number(request.total_amount)
  if (request.amount != null) return Number(request.amount)
  if (request.payment_request_lines) {
    return request.payment_request_lines.reduce(
      (sum: number, line: any) => sum + Number(line.amount ?? line.amount_with_tax ?? 0),
      0
    )
  }
  return 0
}

const partnerName = (request: any) =>
  request.partner_name ??
  request.partner?.name ??
  request.payment_request_lines?.[0]?.partner_name ??
  "不明"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  const accessToken = req.cookies.get("freee_access_token")?.value
  const companyId = req.cookies.get("freee_company_id")?.value

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: "freee未連携" }, { status: 401 })
  }

  const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
  const freeeRes = await fetch(`https://api.freee.co.jp/api/1/payment_requests?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!freeeRes.ok) {
    const detail = await freeeRes.text().catch(() => "")
    return NextResponse.json({ error: "freee支払依頼APIエラー", detail }, { status: 502 })
  }

  const body = await freeeRes.json()
  const requests = body.payment_requests ?? body
  if (!Array.isArray(requests)) {
    return NextResponse.json({ error: "データ形式が不正です", raw: body }, { status: 502 })
  }

  return NextResponse.json(requests.map((request: any) => ({
    freeeId: String(request.id),
    invoiceNumber: request.invoice_number ?? request.form_number ?? `FREEE-PR-${request.id}`,
    partnerName: partnerName(request),
    title: request.title ?? request.description ?? request.payment_request_lines?.[0]?.description ?? "支払依頼",
    invoiceDate: request.issue_date ?? request.application_date ?? request.created_at?.slice(0, 10) ?? null,
    dueDate: request.payment_date ?? request.due_date ?? request.approval_deadline ?? null,
    totalAmount: totalAmount(request),
    status: request.status ?? "unpaid",
  })))
}
