import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  try {
    // CLIENTロール: 自社と連携済み会社のみ返す
    if (u.role === "CLIENT") {
      // 連携済み会社IDを取得
      const links = await (prisma as any).companyLink.findMany({
        where: {
          status: "APPROVED",
          OR: [
            { companyAId: u.companyId },
            { companyBId: u.companyId },
          ],
        },
        select: { companyAId: true, companyBId: true },
      })
      const linkedIds = links.map((l: any) =>
        l.companyAId === u.companyId ? l.companyBId : l.companyAId
      )
      // 連携済み会社のみ（自社は請求先にしない）
      const companies = await prisma.company.findMany({
        where: { id: { in: linkedIds }, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true, createdAt: true },
      })
      return NextResponse.json(companies)
    }

    // ADMINロール: 全CLIENT会社を返す（既存動作）
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
