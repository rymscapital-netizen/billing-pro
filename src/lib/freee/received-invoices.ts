export type FreeeReceivedCandidate = {
  freeeId: string
  sourceId: string
  sourceType: "receipt"
  invoiceNumber: string | null
  displayNumber: string
  partnerName: string
  title: string
  invoiceDate: string | null
  dueDate: string | null
  totalAmount: number
  status: string
  notes: string | null
}

const receiptPartnerName = (receipt: any) =>
  receipt.receipt_metadatum?.partner_name ??
  receipt.partner_name ??
  "不明"

const receiptTitle = (receipt: any) =>
  receipt.description ??
  (receipt.document_type === "invoice" ? "請求書" : "証憑ファイル")

const receiptDisplayNumber = (receipt: any) =>
  receipt.description ??
  receipt.receipt_metadatum?.issue_date ??
  `ファイルNo.${receipt.id}`

const parseFreeeError = async (res: Response) => {
  const text = await res.text().catch(() => "")
  try {
    const json = JSON.parse(text)
    return json.message ?? json.error ?? json.messages?.join(" / ") ?? text
  } catch {
    return text
  }
}

const fetchReceiptBoxItems = async (accessToken: string, companyId: string) => {
  const end = new Date()
  const start = new Date(end)
  start.setFullYear(start.getFullYear() - 1)
  const params = new URLSearchParams({
    company_id: companyId,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    category: "without_deal",
    limit: "100",
    offset: "0",
  })
  const res = await fetch(`https://api.freee.co.jp/api/1/receipts?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`ファイルボックスAPI: ${res.status} ${await parseFreeeError(res)}`)

  const body = await res.json()
  const receipts = body.receipts ?? body
  if (!Array.isArray(receipts)) throw new Error("ファイルボックスAPIのデータ形式が不正です")

  return receipts.map((receipt: any): FreeeReceivedCandidate => {
    const freeeId = String(receipt.id)
    const metadata = receipt.receipt_metadatum ?? {}
    const issueDate = metadata.issue_date ?? receipt.created_at?.slice(0, 10) ?? null
    return {
      freeeId,
      sourceId: `receipt:${freeeId}`,
      sourceType: "receipt",
      invoiceNumber: metadata.invoice_number ?? null,
      displayNumber: receiptDisplayNumber(receipt),
      partnerName: receiptPartnerName(receipt),
      title: receiptTitle(receipt),
      invoiceDate: issueDate,
      dueDate: issueDate,
      totalAmount: Number(metadata.amount ?? 0),
      status: "unpaid",
      notes: receipt.description ?? null,
    }
  })
}

export const fetchFreeeReceivedCandidates = async (accessToken: string, companyId: string) => {
  try {
    return await fetchReceiptBoxItems(accessToken, companyId)
  } catch (receiptError: any) {
    throw new Error(receiptError?.message ?? "ファイルボックスAPIエラー")
  }
}
