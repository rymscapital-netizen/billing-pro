import { auth } from "@/lib/auth"
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
      ? "*, company:Company(id,name), payments:InvoicePayment(*), profit:InvoiceProfit(*), assignedUser:User!Invoice_assignedUserId_fkey(id,name)"
      : "*, company:Company(id,name), payments:InvoicePayment(*), assignedUser:User!Invoice_assignedUserId_fkey(id,name)"

    let q = sb.from("Invoice").select(selectFields).order("dueDate", { ascending: true })

    if (u.role === "ADMIN") {
      // 管理者: 全件（フィルターのみ適用）
      if (filterCompanyId) q = q.eq("companyId", filterCompanyId)
      if (filterUserId)    q = q.eq("assignedUserId", filterUserId)
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

    const { data, error } = await q
    if (error) throw new Error(error.message)

    let rows = (data ?? []).map((r: any) => ({
      ...r,
      profit:       Array.isArray(r.profit)       ? (r.profit[0]       ?? null) : r.profit,
      payments:     Array.isArray(r.payments)     ? r.payments                  : [],
      company:      Array.isArray(r.company)      ? (r.company[0]      ?? null) : r.company,
      assignedUser: Array.isArray(r.assignedUser) ? (r.assignedUser[0] ?? null) : r.assignedUser,
    }))

    if (unclearedMode) {
      rows = rows.filter((r: any) =>
        r.payments.some((p: any) => p.paymentStatus === "CONFIRMED" && p.clearStatus === "UNCLEARED")
      )
    }

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

  const invoice = await (prisma.invoice.create as any)({
    data: {
      invoiceNumber:   body.invoiceNumber,
      companyId:       body.companyId,
      issuerCompanyId: u.companyId,
      assignedUserId:  body.assignedUserId ?? null,
      subject:         body.subject,
      issueDate:       new Date(body.issueDate),
      dueDate:         new Date(body.dueDate),
      subtotal:        body.subtotal,
      tax:             body.tax,
      amount,
      status:          "ISSUED",
      notes:           body.notes,
      profit: body.profit ? {
        create: {
          sales:       body.profit.sales,
          cost:        body.profit.cost,
          grossProfit: body.profit.grossProfit,
          profitRate:  body.profit.profitRate,
        }
      } : undefined,
      payments: {
        create: { paymentStatus: "UNPAID", clearStatus: "UNCLEARED" }
      },
    },
    include: { company: true, profit: true, payments: true },
  })

  // 受取側（companyId）に ReceivedInvoice を自動生成
  // 発行者と受取先が異なる会社の場合のみ（自社宛は不要）
  if (body.companyId !== u.companyId) {
    try {
      const issuerCompany = await prisma.company.findUnique({
        where: { id: u.companyId },
        select: { name: true },
      })
      const sb = getSb()
      await sb.from("ReceivedInvoice").insert({
        id:            require("crypto").randomUUID(),
        invoiceId:     invoice.id,
        invoiceNumber: body.invoiceNumber,
        vendorName:    issuerCompany?.name ?? "",
        subject:       body.subject,
        issueDate:     new Date(body.issueDate).toISOString(),
        dueDate:       new Date(body.dueDate).toISOString(),
        amount,
        status:        "UNPAID",
        ownerCompanyId: body.companyId,
        notes:         body.notes ?? null,
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
      })
    } catch (e: any) {
      console.error("[invoices POST] ReceivedInvoice auto-create failed:", e?.message)
    }
  }

  return NextResponse.json(invoice, { status: 201 })
}