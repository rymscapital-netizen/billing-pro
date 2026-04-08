import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateInvoicePdf } from "@/lib/pdf-generator"
import { uploadPdf } from "@/lib/storage"
import { NextRequest, NextResponse } from "next/server"

// POST /api/invoices/[id]/generate-pdf
// 請求書PDFを生成してStorageに保存し、署名URLを返す
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { company: true },
  })
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if ((invoice as any).issuerCompanyId !== (session.user as any).companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // PDF生成データを組み立て
  const pdfData = {
    invoiceNumber: invoice.invoiceNumber,
    issueDate:     invoice.issueDate.toISOString(),
    dueDate:       invoice.dueDate.toISOString(),
    subject:       invoice.subject,
    subtotal:      Number(invoice.subtotal),
    tax:           Number(invoice.tax),
    amount:        Number(invoice.amount),
    notes:         invoice.notes ?? undefined,
    clientName:    invoice.company.name,
    // 発行元情報（本来は自社マスタから取得）
    issuerName:    process.env.ISSUER_NAME    ?? "株式会社BillingPro",
    issuerAddress: process.env.ISSUER_ADDRESS ?? "東京都千代田区〇〇1-2-3",
    issuerTel:     process.env.ISSUER_TEL     ?? "03-0000-0000",
    issuerEmail:   process.env.ISSUER_EMAIL   ?? "billing@example.co.jp",
  }

  // PDF生成
  const pdfBuffer = await generateInvoicePdf(pdfData)

  // Supabase Storage にアップロード
  const uint8Array = new Uint8Array(pdfBuffer)
  const file = new File([uint8Array], `${invoice.invoiceNumber}.pdf`, {
    type: "application/pdf",
  })
  const storagePath = await uploadPdf(file, invoice.invoiceNumber)

  // DBのpdfUrlを更新
  await prisma.invoice.update({
    where: { id },
    data: { pdfUrl: storagePath },
  })

  return NextResponse.json({
    success: true,
    storagePath,
    message: "PDFを生成しました",
  })
}
