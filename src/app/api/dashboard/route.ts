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

// 自社が受け取った請求書（経費）= ownerCompanyId でフィルタ
async function getMonthlyExpense(
  sb: ReturnType<typeof getSupabase>,
  start: Date, end: Date,
  ownerCompanyId: string,
): Promise<number> {
  const { data, error } = await sb.from("ReceivedInvoice")
    .select("amount")
    .eq("ownerCompanyId", ownerCompanyId)
    .gte("dueDate", start.toISOString())
    .lte("dueDate", end.toISOString())
  if (error) throw new Error(`getMonthlyExpense: ${error.message}`)
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0)
}

// 自社が発行した請求書（売上）= issuerCompanyId でフィルタ
async function getMonthlyPL(
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
  if (error) throw new Error(`getMonthlyPL: ${error.message}`)
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

    const u   = session.user as any
    const cid = u.companyId as string

    // ADMIN・CLIENT 共通：自社が発行した請求書を売上として集計 / 受け取った請求書を経費として集計
    const [prevMonth, thisMonth, nextMonth, prevExpense, thisExpense, nextExpense] = await Promise.all([
      getMonthlyPL(sb, prevStart, prevEnd, cid, filterUserId),
      getMonthlyPL(sb, msStart,   msEnd,   cid, filterUserId),
      getMonthlyPL(sb, nextStart, nextEnd, cid, filterUserId),
      getMonthlyExpense(sb, prevStart, prevEnd, cid),
      getMonthlyExpense(sb, msStart,   msEnd,   cid),
      getMonthlyExpense(sb, nextStart, nextEnd, cid),
    ])

    const thisMonthDue  = thisMonth.salesInc
    const thisMonthPaid = thisMonth.paid

    if (u.role === "ADMIN") {
      // 自社発行の未回収・延滞・未消込
      let overdueQ = sb.from("Invoice").select("*", { count: "exact", head: true })
        .eq("issuerCompanyId", cid).eq("status", "OVERDUE")
      let unpaidQ  = sb.from("Invoice").select("amount")
        .eq("issuerCompanyId", cid)
        .in("status", ["ISSUED", "PENDING", "OVERDUE", "PAYMENT_CONFIRMED"])
      if (filterUserId) {
        overdueQ = (overdueQ as any).eq("assignedUserId", filterUserId)
        unpaidQ  = (unpaidQ  as any).eq("assignedUserId", filterUserId)
      }

      const [
        { count: overdueCount },
        { count: unclearedCount },
        { data: allUnpaidRows, error: e1 },
        // 被請求書（自社 ownerCompanyId）= 全期間の未払い経費
        { data: rcvRows, error: e2 },
      ] = await Promise.all([
        overdueQ,
        sb.from("InvoicePayment").select("*", { count: "exact", head: true })
          .eq("paymentStatus", "CONFIRMED").eq("clearStatus", "UNCLEARED"),
        unpaidQ,
        sb.from("ReceivedInvoice").select("amount, status")
          .eq("ownerCompanyId", cid),
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
          prev:    { ...plShape(prevMonth), expenseTotal: prevExpense,  balance: prevMonth.salesInc  - prevExpense  },
          current: { ...plShape(thisMonth), expenseTotal: thisExpense,  balance: thisMonth.salesInc  - thisExpense  },
          next:    { ...plShape(nextMonth), expenseTotal: nextExpense,  balance: nextMonth.salesInc  - nextExpense  },
        },
      })
    }

    // ── 取引先（CLIENT）────────────────────────────────────────────────────
    const [
      { count: overdueCount },
      { count: unclearedCount },
      { data: allUnpaidRows, error: e1 },
      { count: nextMonthCount },
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
        .eq("ownerCompanyId", cid),
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
        prev:    { ...plShape(prevMonth), expenseTotal: prevExpense,  balance: prevMonth.salesInc  - prevExpense  },
        current: { ...plShape(thisMonth), expenseTotal: thisExpense,  balance: thisMonth.salesInc  - thisExpense  },
        next:    { ...plShape(nextMonth), expenseTotal: nextExpense,  balance: nextMonth.salesInc  - nextExpense  },
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
