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

  const headers = { Authorization: `Bearer ${accessToken}` }
  const tryFetch = async (url: string) => {
    const r = await fetch(url, { headers })
    const t = await r.text()
    return { status: r.status, body: t.slice(0, 300) }
  }

  const results = await Promise.all([
    tryFetch(`https://invoice.secure.freee.co.jp/api/v2/invoice_requests?limit=5`),
    tryFetch(`https://invoice.secure.freee.co.jp/api/v2/companies/${companyId}/invoices?limit=5`),
    tryFetch(`https://invoice.secure.freee.co.jp/api/v1/invoice_requests?limit=5`),
    tryFetch(`https://api.freee.co.jp/invoice/v2/invoices?company_id=${companyId}&limit=5`),
    tryFetch(`https://api.freee.co.jp/invoice/v1/invoices?company_id=${companyId}&limit=5`),
  ])

  return NextResponse.json({
    companyId,
    "invoice.secure/api/v2/invoice_requests": results[0],
    "invoice.secure/api/v2/companies/{id}/invoices": results[1],
    "invoice.secure/api/v1/invoice_requests": results[2],
    "api.freee/invoice/v2/invoices": results[3],
    "api.freee/invoice/v1/invoices": results[4],
  })
}
