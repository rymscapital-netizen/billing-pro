import { auth } from "@/lib/auth"
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer"
import { NextRequest, NextResponse } from "next/server"

function getClient() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  const key      = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  if (!endpoint || !key) throw new Error("Azure Document Intelligence の環境変数が未設定です")
  return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key))
}

// CurrencyValue または number から金額を取得
function toAmount(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number") return v
  if (typeof v === "object" && "amount" in (v as any)) return (v as any).amount ?? null
  return null
}

// Date → YYYY-MM-DD
function toDateStr(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v as string)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 })

  // ファイルを Buffer に変換
  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const client  = getClient()
    const poller  = await client.beginAnalyzeDocument(
      "prebuilt-invoice",
      buffer
    )
    const result  = await poller.pollUntilDone()
    const doc     = result.documents?.[0]

    if (!doc) {
      return NextResponse.json({ error: "請求書を認識できませんでした" }, { status: 422 })
    }

    const f = doc.fields as Record<string, any>

    // 件名: 明細1件目の説明 or 空
    const firstItem    = f.items?.values?.[0]?.properties
    const subjectValue = firstItem?.description?.content ?? null

    // 税抜・税額・合計を取得
    const subTotalAmt  = toAmount(f.subTotal?.value)
    const totalTaxAmt  = toAmount(f.totalTax?.value)
    const invoiceTotAmt = toAmount(f.invoiceTotal?.value)

    // 税抜が取れない場合は合計から逆算（10%仮定）
    const subtotal = subTotalAmt
      ?? (invoiceTotAmt != null ? Math.round(invoiceTotAmt / 1.1) : null)
    const tax = totalTaxAmt
      ?? (subtotal != null && invoiceTotAmt != null ? invoiceTotAmt - subtotal : null)

    const extracted = {
      invoiceNumber: {
        value:      f.invoiceId?.content ?? null,
        confidence: f.invoiceId?.confidence ?? 0,
      },
      vendorName: {
        value:      f.vendorName?.content ?? null,
        confidence: f.vendorName?.confidence ?? 0,
      },
      customerName: {
        value:      f.customerName?.content ?? null,
        confidence: f.customerName?.confidence ?? 0,
      },
      issueDate: {
        value:      toDateStr(f.invoiceDate?.value) ?? f.invoiceDate?.content ?? null,
        confidence: f.invoiceDate?.confidence ?? 0,
      },
      dueDate: {
        value:      toDateStr(f.dueDate?.value) ?? f.dueDate?.content ?? null,
        confidence: f.dueDate?.confidence ?? 0,
      },
      subject: {
        value:      subjectValue,
        confidence: firstItem?.description?.confidence ?? 0,
      },
      subtotal: {
        value:      subtotal,
        confidence: f.subTotal?.confidence ?? (invoiceTotAmt != null ? 0.7 : 0),
      },
      tax: {
        value:      tax,
        confidence: f.totalTax?.confidence ?? 0,
      },
      amount: {
        value:      invoiceTotAmt,
        confidence: f.invoiceTotal?.confidence ?? 0,
      },
    }

    return NextResponse.json({ extracted })

  } catch (e: any) {
    console.error("[ocr/upload]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "OCR処理に失敗しました" },
      { status: 500 }
    )
  }
}
