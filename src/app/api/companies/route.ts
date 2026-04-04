import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  try {
    if (u.role === "CLIENT") {
      // 連携済み会社IDを取得
      const links = await (prisma as any).companyLink.findMany({
        where: {
          status: "APPROVED",
          OR: [{ companyAId: u.companyId }, { companyBId: u.companyId }],
        },
        select: { companyAId: true, companyBId: true },
      })
      const linkedIds: string[] = links.map((l: any) =>
        l.companyAId === u.companyId ? l.companyBId : l.companyAId
      )

      // 自社が登録した会社 OR 連携済み会社
      const companies = await prisma.company.findMany({
        where: {
          isActive: true,
          OR: [
            { createdByCompanyId: u.companyId },
            { id: { in: linkedIds } },
          ],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true, createdAt: true },
      })
      return NextResponse.json(companies)
    }

    // ADMINロール: 自社が登録した会社のみ（createdByCompanyId = 自社 OR ADMIN作成分）
    const companies = await prisma.company.findMany({
      where: {
        type: "CLIENT",
        OR: [
          { createdByCompanyId: u.companyId },
          { createdByCompanyId: null }, // 移行前の既存データ（ADMIN作成）
        ],
      },
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
  const u = session.user as any
  const body = createSchema.parse(await req.json())
  const company = await prisma.company.create({
    data: { name: body.name, type: "CLIENT", createdByCompanyId: u.companyId },
  })
  return NextResponse.json(company, { status: 201 })
}
