import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const companies = await prisma.company.findMany({
      where: { type: "CLIENT" },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { invoices: true } },
        invoices: {
          select: { amount: true, status: true },
          where: { status: { in: ["ISSUED", "PENDING", "OVERDUE", "PAYMENT_CONFIRMED"] } },
        },
      },
    })

    return NextResponse.json(companies.map(c => ({
      id:               c.id,
      name:             c.name,
      isActive:         c.isActive,
      createdAt:        c.createdAt,
      invoiceCount:     c._count.invoices,
      uncollectedTotal: c.invoices.reduce((s, i) => s + Number(i.amount), 0),
    })))
  } catch (e) {
    console.error("[companies GET]", e)
    return NextResponse.json([], { status: 200 })
  }
}

const createSchema = z.object({
  name: z.string().min(1, "会社名を入力してください"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = createSchema.parse(await req.json())
  const company = await prisma.company.create({
    data: { name: body.name, type: "CLIENT" },
  })
  return NextResponse.json(company, { status: 201 })
}
