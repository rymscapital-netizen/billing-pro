import { auth } from "@/lib/auth"
import { calculateInvoiceProfit } from "@/lib/commission"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { startOfMonth, endOfMonth, addMonths } from "date-fns"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const u = session.user as any
    const { searchParams } = new URL(req.url)
    const filter         = searchParams.get("filter") ?? "all"
    const yearMonth      = searchParams.get("yearMonth")
    const filterUserId   = searchParams.get("assignedUserId")  // 担当者フィルター
    const filterCompanyId = searchParams.get("companyId")       // 法人（取引先）フィルター
    const now       = new Date()
    const sb        = getSb()

    // 日付範囲の決定
    let dateGte: string | null = null
    let dateLte: string | null = null
    let statusEq: string | null = null
    let unclearedMode = false

    if (yearMonth) {
      const [y, m] = yearMonth.split("-").map(Number)
      const base = new Date(y, m - 1, 1)
      dateGte = startOfMonth(base).toISOString()
      dateLte = endOfMonth(base).toISOString()
    } else if (filter === "this_month") {
      dateGte = startOfMonth(now).toISOString()
      dateLte = endOfMonth(now).toISOString()
    } else if (filter === "next_month") {
      const next = addMonths(now, 1)
      dateGte = startOfMonth(next).toISOString()
      dateLte = endOfMonth(next).toISOString()
    } else if (filter === "overdue") {
      statusEq = "OVERDUE"
    } else if (filter === "uncleared") {
      unclearedMode = true
    }

    // view param: "issued"=自分が発行した請求書, "received"=自分宛に届いた請求書, デフォルト=all
    const view = searchParams.get("view") ?? (u.role === "ADMIN" ? "issued" : "received")

    // 利益情報は発行側のみ見える
    // ADMINは常に見える。CLIENTは "issued" ビューのみ
    const includeProfit = u.role === "ADMIN" || view === "issued"
    const selectFields = includeProfit
      ? "*, company:Company!companyId(id,name), payments:InvoicePayment(*), profit:InvoiceProfit(*), assignedUser:User!assignedUserId(id,name), assignments:InvoiceAssignment(*, user:User!userId(id,name))"
      : "*, company:Company!companyId(id,name), payments:InvoicePayment(*), assignedUser:User!assignedUserId(id,name), assignments:InvoiceAssignment(*, user:User!userId(id,name))"

    let q = sb.from("Invoice").select(selectFields).order("dueDate", { ascending: true })

    if (u.role === "ADMIN") {
      // 管理者: 自社が発行した請求書のみ（issuerCompanyId でテナント分離）
      q = q.eq("issuerCompanyId", u.companyId)
      if (filterCompanyId) q = q.eq("companyId", filterCompanyId)
      if (filterUserId) {
        const { data: assignmentRows, error: assignmentError } = await sb.from("InvoiceAssignment")
          .select("invoiceId")
          .eq("userId", filterUserId)
        if (assignmentError) throw new Error(assignmentError.message)
        const invoiceIds = [...new Set((assignmentRows ?? []).map((row: any) => row.invoiceId).filter(Boolean))]
        q = invoiceIds.length > 0
          ? (q as any).or(`assignedUserId.eq.${filterUserId},id.in.(${invoiceIds.join(",")})`)
          : q.eq("assignedUserId", filterUserId)
      }
    } else {
      // 取引先: issued=自分が発行, received=自分宛
      if (view === "issued") {
        q = q.eq("issuerCompanyId", u.companyId)
      } else {
        // received: 自分の companyId 宛、かつ自分が発行していないもの
        q = q.eq("companyId", u.companyId)
        q = (q as any).or(`issuerCompanyId.is.null,issuerCompanyId.neq.${u.companyId}`)
      }
    }

    if (dateGte) q = q.gte("dueDate", dateGte)
    if (dateLte) q = q.lte("dueDate", dateLte)
    if (statusEq) q = q.eq("status", statusEq)
    if (unclearedMode) {
      const { data: unclearedPayments, error: paymentError } = await sb.from("InvoicePayment")
        .select("invoiceId")
        .eq("paymentStatus", "CONFIRMED")
        .eq("clearStatus", "UNCLEARED")

      if (paymentError) throw new Error(paymentError.message)

      const invoiceIds = [...new Set((unclearedPayments ?? []).map((p: any) => p.invoiceId).filter(Boolean))]
      q = invoiceIds.length > 0
        ? (q as any).or(`status.eq.PAYMENT_CONFIRMED,id.in.(${invoiceIds.join(",")})`)
        : q.eq("status", "PAYMENT_CONFIRMED")
    }

    const { data, error } = await q
    if (error) throw new Error(error.message)

    let rows = (data ?? []).map((r: any) => ({
      ...r,
      profit:       Array.isArray(r.profit)       ? (r.profit[0]       ?? null) : r.profit,
      payments:     Array.isArray(r.payments)     ? r.payments                  : [],
      company:      Array.isArray(r.company)      ? (r.company[0]      ?? null) : r.company,
      assignedUser: Array.isArray(r.assignedUser) ? (r.assignedUser[0] ?? null) : r.assignedUser,
      assignments:  Array.isArray(r.assignments)  ? r.assignments.map((a: any) => ({
        ...a,
        user: Array.isArray(a.user) ? (a.user[0] ?? null) : a.user,
      })) : [],
    }))

    return NextResponse.json(rows)
  } catch (e: any) {
    console.error("[invoices GET]", e?.message ?? e)
    return NextResponse.json([], { status: 200 })
  }
}

const createSchema = z.object({
  invoiceNumber:  z.string().min(1),
  companyId:      z.string().min(1),
  assignedUserId: z.string().optional(),
  assignments: z.array(z.object({
    userId: z.string().min(1),
    shareRate: z.number().min(0).max(100),
  })).optional(),
  subject:        z.string().min(1),
  issueDate:      z.string(),
  dueDate:        z.string(),
  subtotal:       z.number().positive(),
  tax:            z.number().min(0),
  notes:          z.string().optional(),
  profit: z.object({
    sales:       z.number(),
    cost:        z.number(),
    grossProfit: z.number(),
    profitRate:  z.number(),
  }).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = createSchema.parse(await req.json())
  const amount = body.subtotal + body.tax
  const u = session.user as any
  const assignments = normalizeAssignments(body.assignments, body.assignedUserId)
  const primaryAssignedUserId = assignments[0]?.userId ?? body.assignedUserId ?? null
  const canonicalProfit = body.profit
    ? calculateInvoiceProfit(body.subtotal, body.profit.cost)
    : null

  const invoice = await (prisma.invoice.create as any)({
    data: {
      invoiceNumber:   body.invoiceNumber,
      companyId:       body.companyId,
      issuerCompanyId: u.companyId,
      assignedUserId:  primaryAssignedUserId,
      subject:         body.subject,
      issueDate:       new Date(body.issueDate),
      dueDate:         new Date(body.dueDate),
      subtotal:        body.subtotal,
      tax:             body.tax,
      amount,
      status:          "ISSUED",
      notes:           body.notes,
      profit: canonicalProfit ? {
        create: {
          sales:       canonicalProfit.sales,
          cost:        canonicalProfit.cost,
          grossProfit: canonicalProfit.grossProfit,
          profitRate:  canonicalProfit.profitRate,
        }
      } : undefined,
      payments: {
        create: { paymentStatus: "UNPAID", clearStatus: "UNCLEARED" }
      },
    },
    include: { company: true, profit: true, payments: true },
  })

  if (assignments.length > 0) {
    await prisma.invoiceAssignment.createMany({
      data: assignments.map(assignment => ({
        invoiceId: invoice.id,
        userId: assignment.userId,
        shareRate: assignment.shareRate,
      })),
      skipDuplicates: true,
    })
  }

  // 受取側（companyId）に ReceivedInvoice を自動生成
  // 発行者と受取先が異なる会社の場合のみ（自社宛は不要）
  if (body.companyId !== u.companyId) {
    try {
      const sb = getSb()
      // Supabase で発行元の会社名を取得（Prisma/pgBouncer を避ける）
      const { data: issuerRows } = await sb.from("Company")
        .select("name").eq("id", u.companyId).limit(1)
      const vendorName = issuerRows?.[0]?.name ?? ""

      await sb.from("ReceivedInvoice").insert({
        id:             crypto.randomUUID(),
        invoiceId:      invoice.id,
        invoiceNumber:  body.invoiceNumber,
        vendorName,
        subject:        body.subject,
        issueDate:      new Date(body.issueDate).toISOString(),
        dueDate:        new Date(body.dueDate).toISOString(),
        amount,
        status:         "UNPAID",
        ownerCompanyId: body.companyId,
        notes:          body.notes ?? null,
        createdAt:      new Date().toISOString(),
        updatedAt:      new Date().toISOString(),
      })
    } catch (e: any) {
      console.error("[invoices POST] ReceivedInvoice auto-create failed:", e?.message)
    }
  }

  return NextResponse.json(invoice, { status: 201 })
}

function normalizeAssignments(
  assignments: { userId?: string; shareRate?: number }[] | undefined,
  assignedUserId?: string
) {
  const source = assignments?.length
    ? assignments
    : assignedUserId
      ? [{ userId: assignedUserId, shareRate: 100 }]
      : []
  const merged = new Map<string, number>()
  for (const assignment of source) {
    if (!assignment.userId) continue
    merged.set(assignment.userId, (merged.get(assignment.userId) ?? 0) + Number(assignment.shareRate ?? 0))
  }
  const rows = Array.from(merged.entries()).map(([userId, shareRate]) => ({ userId, shareRate }))
  const total = rows.reduce((sum, row) => sum + row.shareRate, 0)
  if (rows.length > 0 && Math.round(total * 100) !== 10000) {
    throw new Error("担当者の売上割合の合計は100%にしてください")
  }
  return rows
}
