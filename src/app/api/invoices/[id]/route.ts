import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any

  const invoice = await (prisma.invoice.findUnique as any)({
    where: { id: params.id },
    include: {
      company: true,
      payments: true,
      profit: true,  // 後で権限チェックして除去
    },
  })

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // アクセス制御: 発行者か受取先のみ閲覧可
  const isIssuer    = (invoice as any).issuerCompanyId === u.companyId
  const isRecipient = invoice.companyId === u.companyId
  if (u.role === "CLIENT" && !isIssuer && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 利益情報は発行者のみ見える
  if (u.role === "CLIENT" && !isIssuer) {
    (invoice as any).profit = null
  }

  // 紐づき被請求書を取得（ADMINのみ・raw SQL）
  let linkedReceivedInvoices: any[] = []
  if (u.role === "ADMIN") {
    linkedReceivedInvoices = await prisma.$queryRawUnsafe(
      `SELECT * FROM "ReceivedInvoice" WHERE "invoiceId" = '${params.id}' ORDER BY "dueDate" ASC`
    )
  }

  return NextResponse.json({ ...invoice, linkedReceivedInvoices })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  // 発行者のみ編集可
  if (u.role === "CLIENT") {
    const inv = await prisma.invoice.findUnique({ where: { id: params.id }, select: { issuerCompanyId: true } }) as any
    if (!inv || inv.issuerCompanyId !== u.companyId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const data: any = {}

  if (body.subject   !== undefined) data.subject   = body.subject
  if (body.issueDate !== undefined) data.issueDate = new Date(body.issueDate)
  if (body.dueDate   !== undefined) data.dueDate   = new Date(body.dueDate)
  if (body.notes     !== undefined) data.notes     = body.notes || null
  if (body.subtotal  !== undefined) {
    const tax    = body.tax ?? 0
    data.subtotal = body.subtotal
    data.tax      = tax
    data.amount   = body.subtotal + tax
  }

  const updated = await prisma.invoice.update({
    where: { id: params.id },
    data,
    include: { company: true, payments: true, profit: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  // 発行者のみ削除可
  if (u.role === "CLIENT") {
    const inv = await prisma.invoice.findUnique({ where: { id: params.id }, select: { issuerCompanyId: true } }) as any
    if (!inv || inv.issuerCompanyId !== u.companyId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.invoicePayment.deleteMany({ where: { invoiceId: params.id } })
  await prisma.invoiceProfit.deleteMany({ where: { invoiceId: params.id } })
  await prisma.ocrJob.deleteMany({ where: { invoiceId: params.id } })
  await prisma.invoice.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
