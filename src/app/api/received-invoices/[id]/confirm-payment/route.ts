import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  paidAt: z.string(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body   = schema.parse(await req.json())
  const paidAt = new Date(body.paidAt).toISOString()

  await prisma.$executeRawUnsafe(
    `UPDATE "ReceivedInvoice" SET status = 'PAID', "paidAt" = '${paidAt}', "updatedAt" = NOW() WHERE id = '${id}'`
  )

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "ReceivedInvoice" WHERE id = '${id}'`
  )
  return NextResponse.json(rows[0])
}
