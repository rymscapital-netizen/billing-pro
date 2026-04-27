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

  // 会社情報確認
  const companyRes = await fetch("https://api.freee.co.jp/api/1/companies", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const companyData = await companyRes.json()

  // 請求書取得確認
  const params = new URLSearchParams({ company_id: companyId, limit: "10", offset: "0" })
  const invoiceRes = await fetch(`https://api.freee.co.jp/api/1/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const invoiceData = await invoiceRes.json()

  return NextResponse.json({
    companyId,
    companyStatus: companyRes.status,
    companies: companyData,
    invoiceStatus: invoiceRes.status,
    invoiceCount: Array.isArray(invoiceData.invoices) ? invoiceData.invoices.length : "配列でない",
    invoiceRaw: invoiceData,
  })
}
