import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// PostgreSQL 文字列エスケープ（シングルクォートを ''）
function esc(s: string | null | undefined): string {
  if (s == null) return "NULL"
  return `'${String(s).replace(/'/g, "''")}'`
}

// 紐づき後に InvoiceProfit.cost を再計算
async function syncProfit(invoiceId: string) {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT amount FROM "ReceivedInvoice" WHERE "invoiceId" = '${invoiceId}'`
  )
  if (rows.length === 0) return

  const totalInc = rows.reduce((s: number, r: any) => s + Number(r.amount), 0)
  const cost     = Math.round(totalInc / 1.1)

  const profit: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "InvoiceProfit" WHERE "invoiceId" = '${invoiceId}'`
  )
  if (profit.length === 0) return

  const sales       = Number(profit[0].sales)
  const grossProfit = sales - cost
  const profitRate  = sales > 0 ? (grossProfit / sales) * 100 : 0

  await prisma.$executeRawUnsafe(
    `UPDATE "InvoiceProfit" SET cost = ${cost}, "grossProfit" = ${grossProfit}, "profitRate" = ${profitRate}, "updatedAt" = NOW() WHERE "invoiceId" = '${invoiceId}'`
  )
}

const patchSchema = z.object({
  invoiceId:     z.string().nullable().optional(),
  invoiceNumber: z.string().optional(),
  vendorName:    z.string().min(1).optional(),
  subject:       z.string().min(1).optional(),
  issueDate:     z.string().optional(),
  dueDate:       z.string().optional(),
  amount:        z.number().positive().optional(),
  notes:         z.string().nullable().optional(),
})

// PATCH: 紐づけ更新 or フィールド編集
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = patchSchema.parse(await req.json())

  const before: any[] = await prisma.$queryRawUnsafe(
    `SELECT "invoiceId" FROM "ReceivedInvoice" WHERE id = '${id}'`
  )
  const prevInvoiceId = before[0]?.invoiceId ?? null

  if (body.invoiceNumber !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "invoiceNumber" = ${esc(body.invoiceNumber)}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.vendorName !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "vendorName" = ${esc(body.vendorName)}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.subject !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "subject" = ${esc(body.subject)}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.issueDate !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "issueDate" = '${new Date(body.issueDate).toISOString()}', "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.dueDate !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "dueDate" = '${new Date(body.dueDate).toISOString()}', "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.amount !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "amount" = ${body.amount}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if (body.notes !== undefined)
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "notes" = ${esc(body.notes)}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  if ("invoiceId" in body) {
    const val = body.invoiceId ? `'${body.invoiceId}'` : "NULL"
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "invoiceId" = ${val}, "updatedAt" = NOW() WHERE id = '${id}'`
    )
  }

  const newInvoiceId = "invoiceId" in body ? (body.invoiceId ?? null) : prevInvoiceId
  if (prevInvoiceId && prevInvoiceId !== newInvoiceId) await syncProfit(prevInvoiceId)
  if (newInvoiceId) await syncProfit(newInvoiceId)

  const updated: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "ReceivedInvoice" WHERE id = '${id}'`
  )
  return NextResponse.json(updated[0])
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const target: any[] = await prisma.$queryRawUnsafe(
    `SELECT "invoiceId" FROM "ReceivedInvoice" WHERE id = '${id}'`
  )
  const prevInvoiceId = target[0]?.invoiceId ?? null

  await prisma.$executeRawUnsafe(`DELETE FROM "ReceivedInvoice" WHERE id = '${id}'`)

  if (prevInvoiceId) await syncProfit(prevInvoiceId)

  return NextResponse.json({ success: true })
}
