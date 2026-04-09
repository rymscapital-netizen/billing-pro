import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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

  const body = await req.json()

  const [payment, invoice] = await prisma.$transaction([
    prisma.invoicePayment.update({
      where: { invoiceId: id },
      data: {
        clearStatus:     "CLEARED",
        clearedAt:       new Date(body.clearedAt),
        clearedByUserId: session.user.id,
        notes:           body.notes,
      },
    }),
    prisma.invoice.update({
      where: { id },
      data: { status: "CLEARED" },
    }),
  ])

  // 紐づく ReceivedInvoice を PAID に同期（被請求者のダッシュボードに反映させるため）
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  await sb.from("ReceivedInvoice")
    .update({
      status:    "PAID",
      paidAt:    new Date(body.clearedAt).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq("invoiceId", id)
    .eq("status", "UNPAID")

  return NextResponse.json({ payment, invoice })
}
