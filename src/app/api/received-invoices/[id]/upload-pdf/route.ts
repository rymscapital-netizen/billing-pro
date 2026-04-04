import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 })

    // Supabase Storage にアップロード
    const sb   = getSb()
    const ext  = file.name.split(".").pop() ?? "pdf"
    const path = `received-invoices/${params.id}-${Date.now()}.${ext}`

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // pdfUrl カラムが存在しない場合は追加（初回のみ）
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ReceivedInvoice" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT`
      )
    } catch (_) { /* カラム追加済みの場合は無視 */ }

    // pdfUrl を保存
    await prisma.$executeRawUnsafe(
      `UPDATE "ReceivedInvoice" SET "pdfUrl" = '${path}', "updatedAt" = NOW() WHERE id = '${params.id}'`
    )

    return NextResponse.json({ pdfUrl: path })
  } catch (e: any) {
    console.error("[received-invoices upload-pdf]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 })
  }
}
