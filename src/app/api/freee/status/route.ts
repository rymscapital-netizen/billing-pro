import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("freee_access_token")?.value
  const companyId = req.cookies.get("freee_company_id")?.value

  return NextResponse.json({ connected: Boolean(accessToken && companyId) })
}
