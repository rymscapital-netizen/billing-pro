import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  paymentDate: z.string(),
  paymentAmount: z.number().positive(),
})

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const u = session.user as any
    const sb = getSb()

    const { data: inv, error: invError } = await sb.from("Invoice")
      .select("id, issuerCompanyId")
      .eq("id", id)
      .limit(1)
      .maybeSingle()

    if (invError) throw new Error(invError.message)
    if (!inv || inv.issuerCompanyId !== u.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = schema.parse(await req.json())
    const paymentDate = new Date(body.paymentDate).toISOString()

    const { data: payment, error: paymentError } = await sb.from("InvoicePayment")
      .update({
        paymentStatus: "CONFIRMED",
        paymentDate,
        paymentAmount: body.paymentAmount,
      })
      .eq("invoiceId", id)
      .select()
      .single()

    if (paymentError) throw new Error(paymentError.message)

    const { data: invoice, error: invoiceError } = await sb.from("Invoice")
      .update({ status: "PAYMENT_CONFIRMED" })
      .eq("id", id)
      .select()
      .single()

    if (invoiceError) throw new Error(invoiceError.message)

    await sb.from("ReceivedInvoice")
      .update({
        status: "PAID",
        paidAt: paymentDate,
        updatedAt: new Date().toISOString(),
      })
      .eq("invoiceId", id)
      .eq("status", "UNPAID")

    return NextResponse.json({ payment, invoice })
  } catch (e: any) {
    console.error("[confirm-payment ERROR]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "着金確認に失敗しました" },
      { status: 500 }
    )
  }
}
