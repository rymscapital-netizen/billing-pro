import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const BUCKET = "invoices"

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const u = session.user as any

    const sb = getSb()

    // テナント確認
    const { data: target } = await sb.from("ReceivedInvoice")
      .select("ownerCompanyId").eq("id", id).limit(1)
    if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (target[0].ownerCompanyId !== u.companyId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 })

    const ext  = file.name.split(".").pop() ?? "pdf"
    const path = `received-invoices/${id}-${Date.now()}.${ext}`

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    await sb.from("ReceivedInvoice")
      .update({ pdfUrl: path, updatedAt: new Date().toISOString() })
      .eq("id", id)

    return NextResponse.json({ pdfUrl: path })
  } catch (e: any) {
    console.error("[received-invoices upload-pdf]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 })
  }
}
