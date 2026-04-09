import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { getSignedUrl } from "@/lib/storage"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const u = session.user as any

    const sb = getSb()

    const { data: target } = await sb.from("ReceivedInvoice")
      .select("ownerCompanyId, pdfUrl").eq("id", id).limit(1)
    if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (target[0].ownerCompanyId !== u.companyId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const pdfPath = target[0].pdfUrl
    if (!pdfPath) return NextResponse.json({ error: "No PDF attached" }, { status: 404 })

    const url = await getSignedUrl(pdfPath, 3600)
    return NextResponse.json({ url })
  } catch (e: any) {
    console.error("[received-invoices pdf-url]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 })
  }
}
