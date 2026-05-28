import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const expenseNumber = z.number().min(0).max(999999999)

const upsertSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  userId: z.string().min(1),
  baseSalary: expenseNumber.default(0),
  socialInsurance: expenseNumber.default(0),
  employeeSocialInsurance: expenseNumber.default(0),
  withholdingTax: expenseNumber.default(0),
  rentAllocation: expenseNumber.default(0),
  paidCommission: expenseNumber.default(0),
  travelExpense: expenseNumber.default(0),
  corporateTax: expenseNumber.default(0),
  communicationCost: expenseNumber.default(0),
  welfareExpense: expenseNumber.default(0),
  suppliesExpense: expenseNumber.default(0),
  otherExpense: expenseNumber.default(0),
  otherMemo: z.string().max(500).optional().nullable(),
})

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function canViewAllProfitUsers(user: any) {
  return String(user?.name ?? "").includes("\u6d6a\u7530")
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const yearMonth = searchParams.get("yearMonth")
    if (!/^\d{4}-\d{2}$/.test(yearMonth ?? "")) {
      return NextResponse.json({ error: "Invalid yearMonth" }, { status: 400 })
    }

    const sb = getSupabase()
    let query: any = sb.from("UserMonthlyExpense")
      .select("*")
      .eq("companyId", session.user.companyId)
      .eq("yearMonth", yearMonth!)

    if (!canViewAllProfitUsers(session.user)) {
      query = query.eq("userId", session.user.id)
    }

    const { data, error } = await query.order("updatedAt", { ascending: false })
    if (error) throw new Error(error.message)

    return NextResponse.json(data ?? [])
  } catch (e: any) {
    console.error("[user-monthly-expenses GET]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = upsertSchema.parse(await req.json())
    if (!canViewAllProfitUsers(session.user) && body.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const sb = getSupabase()
    const { data: targetUser, error: userError } = await sb.from("User")
      .select("id, companyId, role")
      .eq("id", body.userId)
      .eq("companyId", session.user.companyId)
      .eq("role", "ADMIN")
      .maybeSingle()

    if (userError) throw new Error(userError.message)
    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const payload = {
      companyId: session.user.companyId,
      userId: body.userId,
      yearMonth: body.yearMonth,
      baseSalary: body.baseSalary,
      socialInsurance: body.socialInsurance,
      employeeSocialInsurance: body.employeeSocialInsurance,
      withholdingTax: body.withholdingTax,
      rentAllocation: body.rentAllocation,
      paidCommission: body.paidCommission,
      travelExpense: body.travelExpense,
      corporateTax: body.corporateTax,
      communicationCost: body.communicationCost,
      welfareExpense: body.welfareExpense,
      suppliesExpense: body.suppliesExpense,
      otherExpense: body.otherExpense,
      otherMemo: body.otherMemo ?? null,
      updatedAt: new Date().toISOString(),
    }

    const { data: existing, error: existingError } = await sb.from("UserMonthlyExpense")
      .select("id")
      .eq("userId", body.userId)
      .eq("yearMonth", body.yearMonth)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)

    const mutation = existing?.id
      ? sb.from("UserMonthlyExpense")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single()
      : sb.from("UserMonthlyExpense")
          .insert({ ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
          .select("*")
          .single()

    const { data, error } = await mutation

    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[user-monthly-expenses PATCH]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
