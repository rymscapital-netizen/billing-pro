import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchFreeeReceivedCandidates } from "@/lib/freee/received-invoices"
import { createClient } from "@supabase/supabase-js"

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
    const candidates = await fetchFreeeReceivedCandidates(accessToken, companyId)
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )
    const ownerCompanyId = (session.user as any).companyId
    const sourceIds = candidates.map(item => item.sourceId)
    const { data: importedRows, error: importedError } = await sb.from("ReceivedInvoice")
      .select("sourceId")
      .eq("source", "freee")
      .eq("ownerCompanyId", ownerCompanyId)
      .in("sourceId", sourceIds)

    if (importedError) throw new Error(importedError.message)
    const importedIds = new Set((importedRows ?? []).map(row => String(row.sourceId)))

    return NextResponse.json(candidates.map(item => ({
      ...item,
      imported: importedIds.has(item.sourceId),
    })))
  } catch (e: any) {
    return NextResponse.json(
      { error: "freeeから被請求書候補を取得できませんでした", detail: e?.message },
      { status: 502 }
    )
  }
}
