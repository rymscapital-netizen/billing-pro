import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await context.params
    const { error } = await getSb().from("ManualProfit")
      .delete()
      .eq("id", id)
      .eq("companyId", (session.user as any).companyId)
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[manual-profits DELETE]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
