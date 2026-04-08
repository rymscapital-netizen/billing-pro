import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

function getClient() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  const key      = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  if (!endpoint || !key) throw new Error("Azure Document Intelligence の環境変数が未設定です")
  return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key))
}

// 日本語通貨文字列 → 数値（"100,000円" → 100000）
// 複数行の場合は最初に数値が含まれる行だけ使う
function parseCurrency(s: string | null | undefined): number | null {
  if (!s) return null
  // 行分割して数値らしい行を探す
  const lines = s.split(/\n/)
  for (const line of lines) {
    const cleaned = line.replace(/[円,\s　￥¥、。]/g, "")
    if (!cleaned) continue
    const num = parseFloat(cleaned)
    if (!isNaN(num) && num > 0) return num
  }
  return null
}

// YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 → YYYY-MM-DD
function parseDate(s: string | null | undefined): string | null {
  if (!s) return null
  // 数字だけ抽出
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

// キー・バリューペアから値を検索（複数キーワードで部分一致）
function findKv(
  kvPairs: Array<{ key: { content?: string }; value?: { content?: string } }>,
  keys: string[]
): string | null {
  for (const kv of kvPairs) {
    const keyContent = kv.key?.content ?? ""
    if (keys.some(k => keyContent.includes(k))) {
      return kv.value?.content?.trim() ?? null
    }
  }
  return null
}

// 名前の正規化（スペース・敬称除去）
function normName(s: string) {
  return s.replace(/[\s　様御中株式会社有限会社合同会社]/g, "").toLowerCase()
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const u = session.user as any

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 })

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  try {
    const client = getClient()

    // prebuilt-document: 日本語請求書のキー・バリューペアを汎用抽出
    const poller = await client.beginAnalyzeDocument("prebuilt-document", buffer)
    const result = await poller.pollUntilDone()

    const kvPairs = (result.keyValuePairs ?? []) as Array<{
      key: { content?: string }
      value?: { content?: string }
      confidence?: number
    }>

    console.log("[OCR] kvPairs:", kvPairs.map(kv => ({
      key: kv.key?.content,
      value: kv.value?.content,
    })))

    // ページ全文（フォールバック用）
    const fullText = result.pages
      ?.flatMap(p => p.lines ?? [])
      .map(l => l.content)
      .join("\n") ?? ""

    // --- 各フィールドを抽出 ---

    const invoiceNumberRaw = findKv(kvPairs, ["請求書番号", "請求番号", "Invoice", "番号"])
    const issueDateRaw     = findKv(kvPairs, ["請求日", "発行日", "作成日"])
    const dueDateRaw       = findKv(kvPairs, ["入金期日", "支払期限", "お支払期限", "期日", "支払日"])
    const subjectRaw       = findKv(kvPairs, ["件名", "品名", "件　名", "摘要"])
    const subtotalRaw      = findKv(kvPairs, ["小計", "税抜", "税抜金額"])
    const taxRaw           = findKv(kvPairs, ["消費税", "税額", "消費税額"])
    const totalRaw         = findKv(kvPairs, ["請求金額合計", "合計金額", "ご請求金額", "請求金額", "合計"])

    // フォールバック: 全文からregexで抽出
    // 請求書番号: 複数行の場合はINV-XXXXXXの行を優先、次に数字のみの行
    function extractInvoiceNumber(raw: string | null): string | null {
      if (!raw) return null
      const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean)
      // INV-XXXXXX パターン優先
      const invLine = lines.find(l => /INV[-\s]?\d+/i.test(l))
      if (invLine) return invLine.match(/INV[-\s]?\d+/i)?.[0] ?? invLine
      // 数字・ハイフンのみの行（日付でないもの）
      const numLine = lines.find(l => /^[\d\-\/]+$/.test(l) && !/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(l))
      if (numLine) return numLine
      return lines[0] ?? null
    }
    const invoiceNumber = extractInvoiceNumber(invoiceNumberRaw)
      ?? fullText.match(/INV[-\s]?\d+/i)?.[0]
      ?? null

    const issueDate = parseDate(issueDateRaw)
      ?? parseDate(fullText.match(/請求日[：: 　]*(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/)?.[1])

    const dueDate = parseDate(dueDateRaw)
      ?? parseDate(fullText.match(/(?:入金期日|支払期限|お支払期限)[：: 　]*(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/)?.[1])
      ?? parseDate(fullText.match(/期限[：: 　]*(\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/)?.[1])

    const subject = subjectRaw
      ?? fullText.match(/件名[：: 　]*([^\n]+)/)?.[1]?.trim()
      ?? null

    const subtotal = parseCurrency(subtotalRaw)
    const tax      = parseCurrency(taxRaw)
    const total    = parseCurrency(totalRaw)

    // 総額から税抜・税率を逆算
    const finalSubtotal = subtotal
      ?? (total != null ? Math.round(total / 1.1) : null)
    const finalTax = tax
      ?? (finalSubtotal != null && total != null ? total - finalSubtotal : null)

    let taxRate: number | null = null
    if (finalSubtotal && finalSubtotal > 0 && finalTax != null) {
      const rate = Math.round((finalTax / finalSubtotal) * 100)
      taxRate = (rate >= 9 && rate <= 11) ? 10 : (rate >= 7 && rate <= 9) ? 8 : rate
    }

    // 取引先名: キーから抽出（御中が付く行）
    let customerNameRaw = findKv(kvPairs, ["御中", "宛先", "請求先"])
    if (!customerNameRaw) {
      const m = fullText.match(/^(.{2,20}(?:株式会社|有限会社|合同会社).{0,10})(?:　| )*御中/m)
      customerNameRaw = m?.[1]?.trim() ?? null
    }

    // 担当者: 自社ユーザーと名前マッチング
    let assignedUserId: string | null = null
    let assignedUserName: string | null = null
    const contactRaw = findKv(kvPairs, ["担当者", "担当", "ご担当"])
    if (contactRaw) {
      const users = await prisma.user.findMany({
        where: { companyId: u.companyId, isActive: true },
        select: { id: true, name: true },
      })
      const normHint = normName(contactRaw)
      const matched = users.find(user => {
        const normUser = normName(user.name)
        return normHint.includes(normUser) || normUser.includes(normHint)
      })
      if (matched) {
        assignedUserId   = matched.id
        assignedUserName = matched.name
      }
    }

    const extracted = {
      invoiceNumber: { value: invoiceNumber,    confidence: invoiceNumber ? 0.9 : 0 },
      vendorName:    { value: null,             confidence: 0 },
      customerName:  { value: customerNameRaw,  confidence: customerNameRaw ? 0.8 : 0 },
      issueDate:     { value: issueDate,         confidence: issueDate ? 0.9 : 0 },
      dueDate:       { value: dueDate,           confidence: dueDate ? 0.9 : 0 },
      subject:       { value: subject,           confidence: subject ? 0.8 : 0 },
      subtotal:      { value: finalSubtotal,     confidence: finalSubtotal != null ? 0.9 : 0 },
      tax:           { value: finalTax,          confidence: finalTax != null ? 0.9 : 0 },
      taxRate:       { value: taxRate,           confidence: taxRate != null ? 0.9 : 0 },
      amount:        { value: total,             confidence: total != null ? 0.9 : 0 },
      assignedUser:  { value: assignedUserId, label: assignedUserName, confidence: assignedUserId ? 0.8 : 0 },
    }

    console.log("[OCR] extracted:", JSON.stringify(extracted, null, 2))

    return NextResponse.json({ extracted })

  } catch (e: any) {
    console.error("[ocr/upload]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "OCR処理に失敗しました" },
      { status: 500 }
    )
  }
}
