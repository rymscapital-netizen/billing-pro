import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchFreeeReceivedCandidates } from "@/lib/freee/received-invoices"

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

  try {
    return NextResponse.json(await fetchFreeeReceivedCandidates(accessToken, companyId))
  } catch (e: any) {
    return NextResponse.json(
      { error: "freeeから被請求書候補を取得できませんでした", detail: e?.message },
      { status: 502 }
    )
  }
}
