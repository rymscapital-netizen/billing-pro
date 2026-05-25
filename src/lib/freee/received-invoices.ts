export type FreeeReceivedCandidate = {
  freeeId: string
  sourceId: string
  sourceType: "payment_request" | "deal"
  invoiceNumber: string
  displayNumber: string
  partnerName: string
  title: string
  invoiceDate: string | null
  dueDate: string | null
  totalAmount: number
  status: string
  notes: string | null
}

const totalPaymentRequestAmount = (request: any) => {
  if (request.total_amount != null) return Number(request.total_amount)
  if (request.amount != null) return Number(request.amount)
  if (Array.isArray(request.payment_request_lines)) {
    return request.payment_request_lines.reduce(
      (sum: number, line: any) => sum + Number(line.amount ?? line.amount_with_tax ?? 0),
      0
    )
  }
  return 0
}

const paymentRequestPartnerName = (request: any) =>
  request.partner_name ??
  request.partner?.name ??
  request.payment_request_lines?.[0]?.partner_name ??
  "不明"

const dealPartnerName = (deal: any) =>
  deal.partner_name ??
  deal.partner?.name ??
  deal.details?.[0]?.partner_name ??
  "不明"

const dealTitle = (deal: any) =>
  deal.memo ??
  deal.receipt_description ??
  deal.details?.find((detail: any) => detail.description)?.description ??
  "支出取引"

const dealDisplayNumber = (deal: any) =>
  deal.ref_number ??
  deal.receipt_id ??
  deal.issue_date ??
  `freee取引 ${deal.id}`

const parseFreeeError = async (res: Response) => {
  const text = await res.text().catch(() => "")
  try {
    const json = JSON.parse(text)
    return json.message ?? json.error ?? json.messages?.join(" / ") ?? text
  } catch {
    return text
  }
}

const fetchPaymentRequests = async (accessToken: string, companyId: string) => {
  const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
  const res = await fetch(`https://api.freee.co.jp/api/1/payment_requests?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`支払依頼API: ${res.status} ${await parseFreeeError(res)}`)

  const body = await res.json()
  const requests = body.payment_requests ?? body
  if (!Array.isArray(requests)) throw new Error("支払依頼APIのデータ形式が不正です")

  return requests.map((request: any): FreeeReceivedCandidate => {
    const freeeId = String(request.id)
    return {
      freeeId,
      sourceId: `payment_request:${freeeId}`,
      sourceType: "payment_request",
      invoiceNumber: request.invoice_number ?? request.form_number ?? `FREEE-PR-${freeeId}`,
      displayNumber: request.invoice_number ?? request.form_number ?? `支払依頼 ${freeeId}`,
      partnerName: paymentRequestPartnerName(request),
      title: request.title ?? request.description ?? request.payment_request_lines?.[0]?.description ?? "支払依頼",
      invoiceDate: request.issue_date ?? request.application_date ?? request.created_at?.slice(0, 10) ?? null,
      dueDate: request.payment_date ?? request.due_date ?? request.approval_deadline ?? null,
      totalAmount: totalPaymentRequestAmount(request),
      status: request.status ?? "unpaid",
      notes: request.memo ?? null,
    }
  })
}

const fetchExpenseDeals = async (accessToken: string, companyId: string) => {
  const params = new URLSearchParams({
    company_id: companyId,
    type: "expense",
    limit: "100",
    offset: "0",
  })
  const res = await fetch(`https://api.freee.co.jp/api/1/deals?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`支出取引API: ${res.status} ${await parseFreeeError(res)}`)

  const body = await res.json()
  const deals = body.deals ?? body
  if (!Array.isArray(deals)) throw new Error("支出取引APIのデータ形式が不正です")

  return deals.map((deal: any): FreeeReceivedCandidate => {
    const freeeId = String(deal.id)
    const dueAmount = Number(deal.due_amount ?? 0)
    return {
      freeeId,
      sourceId: `deal:${freeeId}`,
      sourceType: "deal",
      invoiceNumber: deal.ref_number || `FREEE-DEAL-${freeeId}`,
      displayNumber: dealDisplayNumber(deal),
      partnerName: dealPartnerName(deal),
      title: dealTitle(deal),
      invoiceDate: deal.issue_date ?? null,
      dueDate: deal.due_date ?? deal.issue_date ?? null,
      totalAmount: Number(deal.amount ?? 0),
      status: dueAmount > 0 ? "unpaid" : "paid",
      notes: deal.memo ?? null,
    }
  })
}

export const fetchFreeeReceivedCandidates = async (accessToken: string, companyId: string) => {
  try {
    return await fetchPaymentRequests(accessToken, companyId)
  } catch (paymentRequestError: any) {
    try {
      return await fetchExpenseDeals(accessToken, companyId)
    } catch (dealError: any) {
      throw new Error(
        `${paymentRequestError?.message ?? "支払依頼APIエラー"} / ${dealError?.message ?? "支出取引APIエラー"}`
      )
    }
  }
}
