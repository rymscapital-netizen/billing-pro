import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// POST /api/invoices/[id]/upload-images
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // テナント確認
  const { data: invCheck } = await supabase.from("Invoice")
    .select("issuerCompanyId").eq("id", id).limit(1)
  if (!invCheck?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invCheck[0].issuerCompanyId !== (session.user as any).companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const files = formData.getAll("files") as File[]
  if (!files.length) {
    return NextResponse.json({ error: "No files" }, { status: 400 })
  }

  const uploaded: string[] = []

  for (const file of files) {
    const ext  = file.name.split(".").pop() ?? "jpg"
    const path = `images/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error } = await supabase.storage
      .from("invoices")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (error) {
      console.error("Image upload error:", error)
      continue
    }

    // InvoiceImage レコードを INSERT（生SQL で pgBouncer 回避）
    await supabase
      .from("InvoiceImage")
      .insert({ id: crypto.randomUUID(), invoiceId: id, url: path, createdAt: new Date().toISOString() })

    uploaded.push(path)
  }

  return NextResponse.json({ uploaded })
}
