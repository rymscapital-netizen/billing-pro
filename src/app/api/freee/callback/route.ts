import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(new URL("/admin/invoices?freee=error", req.url))
  }

  const tokenRes = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.FREEE_CLIENT_ID!,
      client_secret: process.env.FREEE_CLIENT_SECRET!,
      redirect_uri: process.env.FREEE_REDIRECT_URI!,
      code,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/admin/invoices?freee=error", req.url))
  }

  const token = await tokenRes.json()

  // 会社ID取得
  const companyRes = await fetch("https://api.freee.co.jp/api/1/companies", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const companyData = await companyRes.json()
  const companyId = companyData.companies?.[0]?.id?.toString() ?? ""

  const res = NextResponse.redirect(new URL("/admin/invoices?freee=connected", req.url))
  const maxAge = token.expires_in ?? 86400
  res.cookies.set("freee_access_token", token.access_token, { httpOnly: true, maxAge })
  res.cookies.set("freee_refresh_token", token.refresh_token ?? "", { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  res.cookies.set("freee_company_id", companyId, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  return res
}
