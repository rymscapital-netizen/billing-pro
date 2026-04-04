import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSignedUrl } from "@/lib/storage"
import { NextRequest, NextResponse } from "next/server"

// GET /api/invoices/[id]/pdf-url
// 署名付きURL（60分有効）を返す。取引先は自社の請求書のみ取得可能。
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { companyId: true, pdfUrl: true },
  })

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // ★ テナント分離: CLIENT は自社の請求書のみ
  if (
    session.user.role === "CLIENT" &&
    invoice.companyId !== session.user.companyId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!invoice.pdfUrl) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 })
  }

  const url = await getSignedUrl(invoice.pdfUrl)
  return NextResponse.json({ url })
}
