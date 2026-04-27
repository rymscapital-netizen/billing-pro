import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  const accessToken = req.cookies.get("freee_access_token")?.value
  const companyId   = req.cookies.get("freee_company_id")?.value

  if (!accessToken || !companyId) {
    return NextResponse.json({
      error: "cookie未設定",
      accessToken: accessToken ? "あり" : "なし",
      companyId:   companyId   ? companyId : "なし",
    }, { status: 401 })
  }

  // freee会計 請求書API（従来）
  const params1 = new URLSearchParams({ company_id: companyId, limit: "5", offset: "0" })
  const res1 = await fetch(`https://api.freee.co.jp/api/1/invoices?${params1}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data1 = await res1.json()

  // freee請求書 API v2 (invoice.secure.freee.co.jp)
  const params2 = new URLSearchParams({ limit: "5", offset: "0" })
  const res2 = await fetch(`https://invoice.secure.freee.co.jp/api/v2/invoices?${params2}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data2 = await res2.text()

  // freee請求書 API v1
  const res3 = await fetch(`https://invoice.secure.freee.co.jp/api/v1/invoices?${params2}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data3 = await res3.text()

  return NextResponse.json({
    companyId,
    accounting_api: { status: res1.status, count: Array.isArray(data1.invoices) ? data1.invoices.length : 0 },
    invoice_api_v2: { status: res2.status, body: data2.slice(0, 500) },
    invoice_api_v1: { status: res3.status, body: data3.slice(0, 500) },
  })
}
