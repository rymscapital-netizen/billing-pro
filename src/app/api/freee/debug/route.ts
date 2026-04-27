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
    return NextResponse.json({ error: "cookie未設定", accessToken: !!accessToken, companyId }, { status: 401 })
  }

  const params = new URLSearchParams({ company_id: companyId, limit: "5", offset: "0" })
  const res = await fetch(`https://api.freee.co.jp/iv/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  const invoices = body.invoices ?? body

  return NextResponse.json({
    companyId,
    status: res.status,
    count: Array.isArray(invoices) ? invoices.length : "配列でない",
    sample: Array.isArray(invoices) ? invoices[0] : body,
  })
}
