import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  if (u.role === "CLIENT") {
    const inv = await prisma.invoice.findUnique({ where: { id: params.id }, select: { issuerCompanyId: true } }) as any
    if (!inv || inv.issuerCompanyId !== u.companyId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()

  const [payment, invoice] = await prisma.$transaction([
    prisma.invoicePayment.update({
      where: { invoiceId: params.id },
      data: {
        clearStatus:     "CLEARED",
        clearedAt:       new Date(body.clearedAt),
        clearedByUserId: session.user.id,
        notes:           body.notes,
      },
    }),
    prisma.invoice.update({
      where: { id: params.id },
      data: { status: "CLEARED" },
    }),
  ])

  return NextResponse.json({ payment, invoice })
}