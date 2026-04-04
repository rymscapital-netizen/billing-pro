import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// 管理者用：Invoice.companyId or assignedUserId でフィルタ
async function getMonthlyPL(
  sb: ReturnType<typeof getSupabase>,
  start: Date, end: Date,
  companyId?: string,
  assignedUserId?: string,
) {
  let q = sb.from("Invoice")
    .select("amount, subtotal, status, InvoiceProfit(cost, grossProfit)")
    .gte("dueDate", start.toISOString())
    .lte("dueDate", end.toISOString())
    .neq("status", "DRAFT")

  if (companyId)      q = (q as any).eq("companyId", companyId)
  if (assignedUserId) q = (q as any).eq("assignedUserId", assignedUserId)

  const { data, error } = await q
  if (error) throw new Error(`getMonthlyPL: ${error.message}`)
  return calcPL(data ?? [])
}

// 取引先用：Invoice.issuerCompanyId でフィルタ（自社が発行した請求書 = 売上）
async function getMonthlyPLClient(
  sb: ReturnType<typeof getSupabase>,
  start: Date, end: Date,
  issuerCompanyId: string,
  assignedUserId?: string,
) {
  let q = sb.from("Invoice")
    .select("amount, subtotal, status, InvoiceProfit(cost, grossProfit)")
    .gte("dueDate", start.toISOString())
    .lte("dueDate", end.toISOString())
    .neq("status", "DRAFT")
    .eq("issuerCompanyId", issuerCompanyId)

  if (assignedUserId) q = (q as any).eq("assignedUserId", assignedUserId)

  const { data, error } = await q
  if (error) throw new Error(`getMonthlyPLClient: ${error.message}`)
  return calcPL(data ?? [])
}

function calcPL(rows: any[]) {
  const getProfit = (r: any) => Array.isArray(r.InvoiceProfit) ? r.InvoiceProfit[0] : r.InvoiceProfit

  const salesInc = rows.reduce((s, r) => s + Number(r.amount   ?? 0), 0)
  const salesEx  = rows.reduce((s, r) => s + Number(r.subtotal ?? 0), 0)
  const salesTax = salesInc - salesEx

  const costEx   = rows.reduce((s, r) => s + Number(getProfit(r)?.cost ?? 0), 0)
  const costInc  = Math.round(costEx * 1.1)
  const costTax  = costInc - costEx

  const profitEx  = salesEx  - costEx
  const profitInc = salesInc - costInc
  const profitTax = profitInc - profitEx

  const paid = rows
    .filter(r => ["PAYMENT_CONFIRMED", "CLEARED"].includes(r.status))
    .reduce((s, r) => s + Number(r.amount), 0)

  return {
    salesInc, salesEx, salesTax,
    costInc, costEx, costTax,
    profitInc, profitEx, profitTax,
    paid, count: rows.length,
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sb = getSupabase()
    const { searchParams } = new URL(req.url)
    const filterUserId = searchParams.get("assignedUserId") ?? undefined

    const now       = new Date()
    const msStart   = startOfMonth(now)
    const msEnd     = endOfMonth(now)
    const nextStart = startOfMonth(addMonths(now, 1))
    const nextEnd   = endOfMonth(addMonths(now, 1))
    const prevStart = startOfMonth(subMonths(now, 1))
    const prevEnd   = endOfMonth(subMonths(now, 1))

    const u = session.user as any

    // ── 管理者 ─────────────────────────────────────────────────────────────
    if (u.role === "ADMIN") {
      const [prevMonth, thisMonth, nextMonth] = await Promise.all([
        getMonthlyPL(sb, prevStart, prevEnd, undefined, filterUserId),
        getMonthlyPL(sb, msStart,   msEnd,   undefined, filterUserId),
        getMonthlyPL(sb, nextStart, nextEnd, undefined, filterUserId),
      ])

      const thisMonthDue  = thisMonth.salesInc
      const thisMonthPaid = thisMonth.paid

      let overdueQ = sb.from("Invoice").select("*", { count: "exact", head: true }).eq("status", "OVERDUE")
      let unpaidQ  = sb.from("Invoice").select("amount").in("status", ["ISSUED", "PENDING", "OVERDUE", "PAYMENT_CONFIRMED"])
      if (filterUserId) {
        overdueQ = (overdueQ as any).eq("assignedUserId", filterUserId)
        unpaidQ  = (unpaidQ  as any).eq("assignedUserId", filterUserId)
      }

      const [
        { count: overdueCount },
        { count: unclearedCount },
        { data: allUnpaidRows, error: e1 },
        { data: rcvRows, error: e2 },
      ] = await Promise.all([
        overdueQ,
        sb.from("InvoicePayment").select("*", { count: "exact", head: true })
          .eq("paymentStatus", "CONFIRMED").eq("clearStatus", "UNCLEARED"),
        unpaidQ,
        sb.from("ReceivedInvoice").select("amount, status")
          .gte("dueDate", msStart.toISOString()).lte("dueDate", msEnd.toISOString()),
      ])
      if (e1) throw new Error(`allUnpaid: ${e1.message}`)
      if (e2) throw new Error(`rcvRows: ${e2.message}`)

      const uncollectedTotal = (allUnpaidRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
      const payableTotal     = (rcvRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
      const payablePaid      = (rcvRows ?? []).filter((r: any) => r.status === "PAID").reduce((s: number, r: any) => s + Number(r.amount), 0)
      const profitRate       = thisMonthDue > 0 ? Math.round((thisMonth.profitEx / thisMonthDue) * 1000) / 10 : 0

      return NextResponse.json({
        role: "ADMIN",
        thisMonthDue, thisMonthPaid,
        thisMonthRemaining: thisMonthDue - thisMonthPaid,
        thisMonthCount: thisMonth.count,
        uncollectedTotal, grossProfit: thisMonth.profitEx, profitRate,
        unclearedCount: unclearedCount ?? 0,
        overdueCount:   overdueCount   ?? 0,
        payableTotal, payablePaid,
        payableRemaining: payableTotal - payablePaid,
        monthlyPL: {
          prev:    plShape(prevMonth),
          current: plShape(thisMonth),
          next:    plShape(nextMonth),
        },
      })
    }

    // ── 取引先（CLIENT）── 管理者と同じ構造で返す ─────────────────────────
    const cid = u.companyId as string

    // 売上：自社が issuerCompanyId として発行した Invoice
    const [prevMonth, thisMonth, nextMonth] = await Promise.all([
      getMonthlyPLClient(sb, prevStart, prevEnd, cid, filterUserId),
      getMonthlyPLClient(sb, msStart,   msEnd,   cid, filterUserId),
      getMonthlyPLClient(sb, nextStart, nextEnd, cid, filterUserId),
    ])

    const thisMonthDue  = thisMonth.salesInc
    const thisMonthPaid = thisMonth.paid

    // 期限超過・未消込（自社が発行した請求書）
    const [
      { count: overdueCount },
      { count: unclearedCount },
      { data: allUnpaidRows, error: e1 },
      { count: nextMonthCount },
      // 被請求書（自社 ownerCompanyId）= 今月分の経費
      { data: rcvRows, error: e2 },
    ] = await Promise.all([
      (sb.from("Invoice").select("*", { count: "exact", head: true })
        .eq("issuerCompanyId", cid).eq("status", "OVERDUE") as any),
      (sb.from("InvoicePayment").select("*", { count: "exact", head: true })
        .eq("paymentStatus", "CONFIRMED").eq("clearStatus", "UNCLEARED") as any),
      sb.from("Invoice").select("amount")
        .eq("issuerCompanyId", cid)
        .in("status", ["ISSUED", "PENDING", "OVERDUE", "PAYMENT_CONFIRMED"]),
      (sb.from("Invoice").select("*", { count: "exact", head: true })
        .eq("issuerCompanyId", cid)
        .gte("dueDate", nextStart.toISOString()).lte("dueDate", nextEnd.toISOString())
        .neq("status", "DRAFT") as any),
      sb.from("ReceivedInvoice").select("amount, status")
        .eq("ownerCompanyId", cid)
        .gte("dueDate", msStart.toISOString()).lte("dueDate", msEnd.toISOString()),
    ])
    if (e1) throw new Error(`allUnpaid: ${e1.message}`)
    if (e2) throw new Error(`rcvRows: ${e2.message}`)

    const uncollectedTotal = (allUnpaidRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    const payableTotal     = (rcvRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
    const payablePaid      = (rcvRows ?? []).filter((r: any) => r.status === "PAID").reduce((s: number, r: any) => s + Number(r.amount), 0)
    const profitRate       = thisMonthDue > 0 ? Math.round((thisMonth.profitEx / thisMonthDue) * 1000) / 10 : 0

    return NextResponse.json({
      role: "CLIENT",
      thisMonthDue, thisMonthPaid,
      thisMonthRemaining: thisMonthDue - thisMonthPaid,
      thisMonthCount: thisMonth.count,
      nextMonthCount: nextMonthCount ?? 0,
      uncollectedTotal, grossProfit: thisMonth.profitEx, profitRate,
      unclearedCount: unclearedCount ?? 0,
      overdueCount:   overdueCount   ?? 0,
      payableTotal, payablePaid,
      payableRemaining: payableTotal - payablePaid,
      monthlyPL: {
        prev:    plShape(prevMonth),
        current: plShape(thisMonth),
        next:    plShape(nextMonth),
      },
    })
  } catch (e: any) {
    console.error("[dashboard ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

function plShape(m: ReturnType<typeof calcPL>) {
  return {
    salesInc: m.salesInc, salesEx: m.salesEx, salesTax: m.salesTax,
    costInc:  m.costInc,  costEx:  m.costEx,  costTax:  m.costTax,
    profitInc: m.profitInc, profitEx: m.profitEx, profitTax: m.profitTax,
  }
}
