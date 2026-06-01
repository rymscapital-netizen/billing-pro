import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

const createSchema = z.object({
  name:      z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(6),
  role:      z.enum(["ADMIN", "CLIENT"]),
  companyId: z.string().min(1),
  commissionRate: z.number().min(0).max(100).optional(),
  commissionMode: z.enum(["STANDARD", "FIXED", "TRIAL_20"]).optional(),
  targetGrossProfitShare: z.number().min(0).max(100).optional(),
  targetCommissionAmount: z.number().min(0).optional(),
  employmentStartDate: z.string().optional().nullable(),
  defaultBaseSalary: z.number().min(0).optional(),
  defaultSocialInsurance: z.number().min(0).optional(),
  defaultEmployeeSocialInsurance: z.number().min(0).optional(),
  defaultWithholdingTax: z.number().min(0).optional(),
  defaultTravelExpense: z.number().min(0).optional(),
  defaultCommunicationCost: z.number().min(0).optional(),
  defaultWelfareExpense: z.number().min(0).optional(),
  defaultSuppliesExpense: z.number().min(0).optional(),
})

const updateSchema = z.object({
  userId: z.string().min(1),
  commissionRate: z.number().min(0).max(100).optional(),
  commissionMode: z.enum(["STANDARD", "FIXED", "TRIAL_20"]).optional(),
  targetGrossProfitShare: z.number().min(0).max(100).optional(),
  targetCommissionAmount: z.number().min(0).optional(),
  employmentStartDate: z.string().optional().nullable(),
  defaultBaseSalary: z.number().min(0).optional(),
  defaultSocialInsurance: z.number().min(0).optional(),
  defaultEmployeeSocialInsurance: z.number().min(0).optional(),
  defaultWithholdingTax: z.number().min(0).optional(),
  defaultTravelExpense: z.number().min(0).optional(),
  defaultCommunicationCost: z.number().min(0).optional(),
  defaultWelfareExpense: z.number().min(0).optional(),
  defaultSuppliesExpense: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})

const userSelect = "id, name, email, role, companyId, isActive, commissionRate, commissionMode, targetGrossProfitShare, targetCommissionAmount, employmentStartDate, defaultBaseSalary, defaultSocialInsurance, defaultEmployeeSocialInsurance, defaultWithholdingTax, defaultTravelExpense, defaultCommunicationCost, defaultWelfareExpense, defaultSuppliesExpense, createdAt, updatedAt"
const userDisplayOrder = ["浪田", "西岡", "入内嶋", "髙橋", "高橋"]

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function canViewAllUsers(user: any) {
  return String(user?.name ?? "").includes("浪田")
}

function userSortRank(name: string) {
  const normalized = String(name ?? "")
  const index = userDisplayOrder.findIndex(orderName => normalized.includes(orderName))
  return index === -1 ? userDisplayOrder.length : index
}

function sortUsers(users: any[]) {
  return [...users].sort((a, b) => {
    const rankDiff = userSortRank(a.name) - userSortRank(b.name)
    if (rankDiff !== 0) return rankDiff
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ja")
  })
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  try {
    const sb = getSb()
    let usersQuery: any = sb.from("User")
      .select(userSelect)
      .eq("companyId", u.companyId)
    if (!canViewAllUsers(u)) {
      usersQuery = usersQuery.eq("id", u.id)
    }
    const { data: users, error } = await usersQuery
    if (error) throw new Error(error.message)

    const { data: companies, error: companyError } = await sb.from("Company")
      .select("id, name")
      .eq("id", u.companyId)
      .limit(1)
    if (companyError) throw new Error(companyError.message)

    const company = companies?.[0] ?? null
    return NextResponse.json(sortUsers(users ?? []).map(user => ({ ...user, company })))
  } catch (e) {
    console.error("[users GET]", e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any
  const body = createSchema.parse(await req.json())

  if (body.role === "ADMIN" && !canViewAllUsers(u)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (u.role === "CLIENT" && body.companyId !== u.companyId) {
    return NextResponse.json({ error: "自社以外へのスタッフ登録はできません" }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } })
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスはすでに登録されています" }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(body.password, 12)
  const role = u.role === "CLIENT" ? "CLIENT" : body.role

  const user = await (prisma.user.create as any)({
    data: {
      name:         body.name,
      email:        body.email,
      passwordHash,
      role,
      companyId:    body.companyId,
      commissionRate: role === "ADMIN" ? body.commissionRate ?? 0 : 0,
      commissionMode: role === "ADMIN" ? body.commissionMode ?? "STANDARD" : "STANDARD",
      targetGrossProfitShare: role === "ADMIN" ? body.targetGrossProfitShare ?? 0 : 0,
      targetCommissionAmount: role === "ADMIN" ? body.targetCommissionAmount ?? 0 : 0,
      employmentStartDate: role === "ADMIN" && body.employmentStartDate ? new Date(body.employmentStartDate) : null,
      defaultBaseSalary: role === "ADMIN" ? body.defaultBaseSalary ?? 0 : 0,
      defaultSocialInsurance: role === "ADMIN" ? body.defaultSocialInsurance ?? 0 : 0,
      defaultEmployeeSocialInsurance: role === "ADMIN" ? body.defaultEmployeeSocialInsurance ?? 0 : 0,
      defaultWithholdingTax: role === "ADMIN" ? body.defaultWithholdingTax ?? 0 : 0,
      defaultTravelExpense: role === "ADMIN" ? body.defaultTravelExpense ?? 0 : 0,
      defaultCommunicationCost: role === "ADMIN" ? body.defaultCommunicationCost ?? 0 : 0,
      defaultWelfareExpense: role === "ADMIN" ? body.defaultWelfareExpense ?? 0 : 0,
      defaultSuppliesExpense: role === "ADMIN" ? body.defaultSuppliesExpense ?? 0 : 0,
    },
    include: { company: { select: { id: true, name: true } } },
  })
  return NextResponse.json(user, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any
  if (u.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = updateSchema.parse(await req.json())
  if (!canViewAllUsers(u)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const sb = getSb()

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() }
  if (body.commissionRate !== undefined) updates.commissionRate = body.commissionRate
  if (body.commissionMode !== undefined) updates.commissionMode = body.commissionMode
  if (body.targetGrossProfitShare !== undefined) updates.targetGrossProfitShare = body.targetGrossProfitShare
  if (body.targetCommissionAmount !== undefined) updates.targetCommissionAmount = body.targetCommissionAmount
  if (body.employmentStartDate !== undefined) updates.employmentStartDate = body.employmentStartDate || null
  for (const field of [
    "defaultBaseSalary",
    "defaultSocialInsurance",
    "defaultEmployeeSocialInsurance",
    "defaultWithholdingTax",
    "defaultTravelExpense",
    "defaultCommunicationCost",
    "defaultWelfareExpense",
    "defaultSuppliesExpense",
  ] as const) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  if (body.isActive !== undefined) updates.isActive = body.isActive

  const { data, error } = await sb.from("User")
    .update(updates)
    .eq("id", body.userId)
    .eq("companyId", u.companyId)
    .select(userSelect)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: companies } = await sb.from("Company")
    .select("id, name")
    .eq("id", u.companyId)
    .limit(1)

  return NextResponse.json({ ...data, company: companies?.[0] ?? null })
}
