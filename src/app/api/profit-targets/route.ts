import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const targetUserSchema = z.object({
  userId: z.string().min(1),
  targetGrossProfitShare: z.number().min(0).max(100),
  targetCommissionAmount: z.number().min(0),
})

const schema = z.object({
  annualGrossProfitTarget: z.number().min(0).max(99999999999999).optional(),
  users: z.array(targetUserSchema).optional(),
})

function canManageAllTargets(user: any) {
  return String(user?.name ?? "").includes("\u6d6a\u7530")
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const currentUser = session.user as any
  const body = schema.parse(await req.json())
  const canManageAll = canManageAllTargets(currentUser)
  const sb = getSupabase()

  if (body.annualGrossProfitTarget !== undefined) {
    if (!canManageAll) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const { error } = await sb.from("Company")
      .update({ annualGrossProfitTarget: body.annualGrossProfitTarget })
      .eq("id", currentUser.companyId)
      .eq("type", "ADMIN")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const row of body.users ?? []) {
    if (!canManageAll && row.userId !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error } = await sb.from("User")
      .update({
        targetGrossProfitShare: row.targetGrossProfitShare,
        targetCommissionAmount: row.targetCommissionAmount,
      })
      .eq("id", row.userId)
      .eq("companyId", currentUser.companyId)
      .eq("role", "ADMIN")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
