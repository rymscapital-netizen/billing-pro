import { auth } from "@/lib/auth"
import { uploadPdf } from "@/lib/storage"
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sb = getSb()
  const { data: invoice, error: invoiceError } = await sb.from("Invoice")
    .select("invoiceNumber, issuerCompanyId")
    .eq("id", id)
    .limit(1)
    .maybeSingle()

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }
  if ((invoice as any).issuerCompanyId !== (session.user as any).companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "File required" }, { status: 400 })
  }

  const storagePath = await uploadPdf(file, (invoice as any).invoiceNumber)
  const { data: updated, error: updateError } = await sb.from("Invoice")
    .update({ pdfUrl: storagePath, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .select("id, pdfUrl")
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
