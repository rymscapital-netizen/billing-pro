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
  totalAmount: number | null
  status: string
  notes: string | null
  readStatus: "read" | "unread"
}

const receiptPartnerName = (receipt: any) =>
  receipt.receipt_metadatum?.partner_name ??
  receipt.receipt_metadatum?.issuer_name ??
  receipt.partner_name ??
  "OCR未読取"

const receiptTitle = (receipt: any) =>
  receipt.description ??
  (receipt.document_type === "invoice" ? "請求書" : "証憑ファイル")

const receiptDisplayNumber = (receipt: any) =>
  receipt.description ??
  receipt.receipt_metadatum?.issue_date ??
  `ファイルNo.${receipt.id}`

const receiptAmount = (receipt: any) => {
  const metadata = receipt.receipt_metadatum ?? {}
  const candidates = [
    metadata.amount,
    metadata.total_amount,
    metadata.amount_with_tax,
    metadata.invoice_amount,
    receipt.amount,
    receipt.total_amount,
  ]
  const value = candidates.find((candidate) => candidate != null && candidate !== "")
  if (value == null) return null
  const numeric = Number(String(value).replace(/,/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

const dealPartnerName = (deal: any) =>
  deal?.partner_name ??
  deal?.partner?.name ??
  deal?.details?.[0]?.partner_name ??
  null

const dealTitle = (deal: any) =>
  deal?.ref_number ??
  deal?.details?.find((detail: any) => detail.description)?.description ??
  null

const fetchReceiptDealMap = async (
  accessToken: string,
  companyId: string,
  startDate: string,
  endDate: string
) => {
  const params = new URLSearchParams({
    company_id: companyId,
    type: "expense",
    start_issue_date: startDate,
    end_issue_date: endDate,
    limit: "3000",
    offset: "0",
  })
  const res = await fetch(`https://api.freee.co.jp/api/1/deals?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return new Map<string, any>()

  const body = await res.json().catch(() => null)
  const deals = body?.deals ?? []
  const map = new Map<string, any>()
  for (const deal of deals) {
    for (const receiptId of deal.receipt_ids ?? []) {
      map.set(String(receiptId), deal)
    }
  }
  return map
}

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
    category: "all",
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

  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  const receiptDealMap = await fetchReceiptDealMap(accessToken, companyId, startDate, endDate)
  const detailedReceipts = await Promise.all(receipts.map(async (receipt: any) => {
    const detailParams = new URLSearchParams({ company_id: companyId })
    const detailRes = await fetch(`https://api.freee.co.jp/api/1/receipts/${receipt.id}?${detailParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!detailRes.ok) return receipt
    const detailBody = await detailRes.json().catch(() => null)
    return detailBody?.receipt ?? detailBody ?? receipt
  }))

  return detailedReceipts.map((receipt: any): FreeeReceivedCandidate => {
    const freeeId = String(receipt.id)
    const metadata = receipt.receipt_metadatum ?? {}
    const linkedDeal = receiptDealMap.get(freeeId)
    const issueDate = metadata.issue_date ?? linkedDeal?.issue_date ?? receipt.created_at?.slice(0, 10) ?? null
    const amount = receiptAmount(receipt) ?? (linkedDeal ? Number(linkedDeal.amount ?? 0) : null)
    return {
      freeeId,
      sourceId: `receipt:${freeeId}`,
      sourceType: "receipt",
      invoiceNumber: metadata.invoice_number ?? null,
      displayNumber: receiptDisplayNumber(receipt),
      partnerName: dealPartnerName(linkedDeal) ?? receiptPartnerName(receipt),
      title: dealTitle(linkedDeal) ?? receiptTitle(receipt),
      invoiceDate: issueDate,
      dueDate: linkedDeal?.due_date ?? issueDate,
      totalAmount: amount,
      status: "unpaid",
      notes: receipt.description ?? null,
      readStatus: amount == null ? "unread" : "read",
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
