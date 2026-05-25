import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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

    const body = await req.json()
    const clearedAt = new Date(body.clearedAt).toISOString()

    const { data: payment, error: paymentError } = await sb.from("InvoicePayment")
      .update({
        clearStatus: "CLEARED",
        clearedAt,
        clearedByUserId: session.user.id,
        notes: body.notes ?? null,
      })
      .eq("invoiceId", id)
      .select()
      .single()

    if (paymentError) throw new Error(paymentError.message)

    const { data: invoice, error: invoiceError } = await sb.from("Invoice")
      .update({ status: "CLEARED" })
      .eq("id", id)
      .select()
      .single()

    if (invoiceError) throw new Error(invoiceError.message)

    await sb.from("ReceivedInvoice")
      .update({
        status: "PAID",
        paidAt: clearedAt,
        updatedAt: new Date().toISOString(),
      })
      .eq("invoiceId", id)
      .eq("status", "UNPAID")

    return NextResponse.json({ payment, invoice })
  } catch (e: any) {
    console.error("[clear ERROR]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "消込処理に失敗しました" },
      { status: 500 }
    )
  }
}
