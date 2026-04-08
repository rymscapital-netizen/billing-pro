import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  paymentDate:   z.string(),
  paymentAmount: z.number().positive(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  // 発行者のみ操作可（ADMIN・CLIENT 問わず）
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { issuerCompanyId: true } }) as any
  if (!inv || inv.issuerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = schema.parse(await req.json())

  const [payment, invoice] = await prisma.$transaction([
    prisma.invoicePayment.update({
      where: { invoiceId: id },
      data: {
        paymentStatus: "CONFIRMED",
        paymentDate:   new Date(body.paymentDate),
        paymentAmount: body.paymentAmount,
      },
    }),
    prisma.invoice.update({
      where: { id },
      data: { status: "PAYMENT_CONFIRMED" },
    }),
  ])

  return NextResponse.json({ payment, invoice })
}
