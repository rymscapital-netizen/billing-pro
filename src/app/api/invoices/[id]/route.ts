import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any

  const invoice = await (prisma.invoice.findUnique as any)({
    where: { id },
    include: {
      company: true,
      payments: true,
      profit: true,
      assignedUser: { select: { id: true, name: true } },
    },
  })

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // アクセス制御: 発行者か受取先のみ閲覧可（ADMIN も自社テナントのみ）
  const isIssuer    = (invoice as any).issuerCompanyId === u.companyId
  const isRecipient = invoice.companyId === u.companyId
  if (!isIssuer && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 利益情報は発行者のみ見える
  if (!isIssuer) {
    (invoice as any).profit = null
  }

  // 紐づき被請求書を取得（ADMINのみ・自社 ownerCompanyId に限定）
  let linkedReceivedInvoices: any[] = []
  if (u.role === "ADMIN") {
    const sb = getSb()
    const { data } = await sb.from("ReceivedInvoice")
      .select("*")
      .eq("invoiceId", id)
      .eq("ownerCompanyId", u.companyId)
      .order("dueDate", { ascending: true })
    linkedReceivedInvoices = data ?? []
  }

  return NextResponse.json({ ...invoice, linkedReceivedInvoices })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  // 発行者のみ編集可（ADMIN・CLIENT 問わず）
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { issuerCompanyId: true, invoiceNumber: true },
  }) as any
  if (!inv || inv.issuerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const data: any = {}

  if (body.subject        !== undefined) data.subject        = body.subject
  if (body.issueDate      !== undefined) data.issueDate      = new Date(body.issueDate)
  if (body.dueDate        !== undefined) data.dueDate        = new Date(body.dueDate)
  if (body.notes          !== undefined) data.notes          = body.notes || null
  if (body.assignedUserId !== undefined) data.assignedUserId = body.assignedUserId || null
  if (body.subtotal       !== undefined) {
    const tax    = body.tax ?? 0
    data.subtotal = body.subtotal
    data.tax      = tax
    data.amount   = body.subtotal + tax
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data,
    include: { company: true, payments: true, profit: true, assignedUser: { select: { id: true, name: true } } },
  })

  // 原価が指定された場合、InvoiceProfit を upsert
  if (body.cost !== undefined) {
    const sales = Number(updated.profit?.sales ?? updated.subtotal)
    const cost  = Number(body.cost)
    const grossProfit = sales - cost
    const profitRate  = sales > 0 ? (grossProfit / sales) * 100 : 0
    await (prisma.invoiceProfit.upsert as any)({
      where:  { invoiceId: id },
      create: { invoiceId: id, sales, cost, grossProfit, profitRate },
      update: { cost, grossProfit, profitRate },
    })
  }

  // 紐づいた ReceivedInvoice を同期（受取側の内容を最新に保つ）
  const rcvUpdates: Record<string, any> = { updatedAt: new Date().toISOString() }
  if (body.subject   !== undefined) rcvUpdates.subject   = body.subject
  if (body.issueDate !== undefined) rcvUpdates.issueDate = new Date(body.issueDate).toISOString()
  if (body.dueDate   !== undefined) rcvUpdates.dueDate   = new Date(body.dueDate).toISOString()
  if (body.notes     !== undefined) rcvUpdates.notes     = body.notes || null
  if (body.subtotal  !== undefined) rcvUpdates.amount    = body.subtotal + (body.tax ?? 0)

  if (Object.keys(rcvUpdates).length > 1) {
    try {
      const sb = getSb()
      await sb.from("ReceivedInvoice")
        .update(rcvUpdates)
        .eq("invoiceId", id)
    } catch (e: any) {
      console.error("[invoices PATCH] ReceivedInvoice sync failed:", e?.message)
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  // 発行者のみ削除可（ADMIN・CLIENT 問わず）
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { issuerCompanyId: true } }) as any
  if (!inv || inv.issuerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // 紐づいた ReceivedInvoice を先に削除
  try {
    const sb = getSb()
    await sb.from("ReceivedInvoice").delete().eq("invoiceId", id)
  } catch (e: any) {
    console.error("[invoices DELETE] ReceivedInvoice cleanup failed:", e?.message)
  }

  await prisma.invoicePayment.deleteMany({ where: { invoiceId: id } })
  await prisma.invoiceProfit.deleteMany({ where: { invoiceId: id } })
  await prisma.ocrJob.deleteMany({ where: { invoiceId: id } })
  await prisma.invoice.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
