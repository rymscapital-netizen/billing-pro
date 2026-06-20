import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

const schema = z.object({
  userId: z.string().min(1),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  profitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1).max(120),
  amount: z.coerce.number().int().positive(),
  memo: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = schema.parse(await req.json())
    const companyId = (session.user as any).companyId
    const sb = getSb()
    const { data: user, error: userError } = await sb.from("User")
      .select("id")
      .eq("id", body.userId)
      .eq("companyId", companyId)
      .eq("isActive", true)
      .maybeSingle()
    if (userError) throw new Error(userError.message)
    if (!user) return NextResponse.json({ error: "担当者が見つかりません" }, { status: 404 })

    const now = new Date().toISOString()
    const { data, error } = await sb.from("ManualProfit")
      .insert({
        id: crypto.randomUUID(),
        companyId,
        userId: body.userId,
        yearMonth: body.yearMonth,
        profitDate: `${body.profitDate}T00:00:00`,
        title: body.title,
        amount: body.amount,
        memo: body.memo || null,
        createdByUserId: (session.user as any).id,
        createdAt: now,
        updatedAt: now,
      })
      .select("*")
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[manual-profits POST]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
