import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadPdf } from "@/lib/storage"
import { NextRequest, NextResponse } from "next/server"

// POST /api/invoices/[id]/upload-pdf
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 請求書の存在確認
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: { invoiceNumber: true },
  })
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "File required" }, { status: 400 })
  }

  // Supabase Storage にアップロード
  const storagePath = await uploadPdf(file, invoice.invoiceNumber)

  // pdfUrl を DB に保存（パスのみ保存、署名URLは都度生成）
  const updated = await prisma.invoice.update({
    where: { id: params.id },
    data: { pdfUrl: storagePath },
    select: { id: true, pdfUrl: true },
  })

  return NextResponse.json(updated)
}
