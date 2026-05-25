import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  bankName: z.string().nullable().optional(),
  bankBranch: z.string().nullable().optional(),
  bankAccountType: z.string().nullable().optional(),
  bankAccountNumber: z.string().nullable().optional(),
  bankAccountHolder: z.string().nullable().optional(),
  bankAccountMemo: z.string().nullable().optional(),
})

const nullableText = (value: string | null | undefined) => {
  if (value === undefined) return undefined
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const u = session.user as any
  const company = await (prisma.company.findUnique as any)({
    where: { id },
    select: { id: true, createdByCompanyId: true, type: true },
  })
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (company.type !== "CLIENT")
    return NextResponse.json({ error: "自社情報はここでは編集できません" }, { status: 400 })
  if (company.createdByCompanyId !== u.companyId && company.createdByCompanyId !== null)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = updateSchema.parse(await req.json())
  const data: Record<string, string | null> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  for (const key of [
    "bankName",
    "bankBranch",
    "bankAccountType",
    "bankAccountNumber",
    "bankAccountHolder",
    "bankAccountMemo",
  ] as const) {
    const value = nullableText(body[key])
    if (value !== undefined) data[key] = value
  }

  const updated = await (prisma.company.update as any)({
    where: { id },
    data,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const u = session.user as any

  // テナント確認: 自社が登録した取引先のみ削除可
  const company = await (prisma.company.findUnique as any)({
    where: { id },
    select: { id: true, createdByCompanyId: true, type: true },
  })
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (company.type !== "CLIENT")
    return NextResponse.json({ error: "自社情報は削除できません" }, { status: 400 })
  if (company.createdByCompanyId !== u.companyId && company.createdByCompanyId !== null)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const sb = getSb()

    // 紐づいた ReceivedInvoice を削除
    await sb.from("ReceivedInvoice").delete().eq("ownerCompanyId", id)

    // 紐づいた CompanyLink を削除
    await sb.from("CompanyLink").delete().or(`companyAId.eq.${id},companyBId.eq.${id}`)

    // 所属ユーザーを削除
    await prisma.user.deleteMany({ where: { companyId: id } })

    // 請求書関連を削除
    const invoices = await (prisma.invoice.findMany as any)({
      where: { OR: [{ companyId: id }, { issuerCompanyId: id }] },
      select: { id: true },
    })
    const invoiceIds = invoices.map((i: any) => i.id)
    if (invoiceIds.length > 0) {
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
      await prisma.invoiceProfit.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
      await prisma.ocrJob.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
      await (prisma.invoice.deleteMany as any)({ where: { id: { in: invoiceIds } } })
    }

    // 会社を削除
    await prisma.company.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[companies DELETE]", e?.message ?? e)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
