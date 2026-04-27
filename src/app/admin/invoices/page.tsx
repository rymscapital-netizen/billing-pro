"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Plus, Trash2, RefreshCw, Link2 } from "lucide-react"
import Link from "next/link"
import { FileDropZone } from "@/components/shared/FileDropZone"

// ─── 請求書（送り側）───────────────────────────────────────────────────────────

type Filter = "all" | "this_month" | "next_month" | "overdue" | "uncleared"

const TABS: { label: string; value: Filter }[] = [
  { label: "全件",         value: "all" },
  { label: "今月支払い",   value: "this_month" },
  { label: "来月支払い",   value: "next_month" },
  { label: "期限超過",     value: "overdue" },
  { label: "未消込",       value: "uncleared" },
]

const toYearMonth = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

const yen  = (n: number) => `¥${Number(n).toLocaleString("ja-JP")}`
const date = (d: string) => new Date(d).toLocaleDateString("ja-JP")

// ─── 被請求書ステータス ──────────────────────────────────────────────────────
const RCV_STATUS: Record<string, { label: string; color: string }> = {
  UNPAID: { label: "未送金",   color: "#c49828" },
  PAID:   { label: "送金済み", color: "#2e9e62" },
}

// ─── ページタブ ──────────────────────────────────────────────────────────────
type PageTab = "issued" | "received"

export default function AdminInvoicesPage() {
  const [pageTab, setPageTab] = useState<PageTab>("issued")

  // ── freee連携 ────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams()
  const [freeeConnected, setFreeeConnected] = useState(false)
  const [freeeSync, setFreeeSync] = useState(false)

  useEffect(() => {
    if (searchParams.get("freee") === "connected") setFreeeConnected(true)
    if (searchParams.get("freee") === "error") showToast("freee連携に失敗しました", false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 共通：ユーザー一覧（担当者フィルター用）──────────────────────────────
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch("/api/users").then(r => r.ok ? r.json() : [])
      .then((users: any[]) => setAllUsers(users.map((u: any) => ({ id: u.id, name: u.name }))))
  }, [])

  // ── 請求書側 state ──────────────────────────────────────────────────────────
  const [filter, setFilter]                   = useState<Filter>("all")
  const [yearMonth, setYearMonth]             = useState("")
  const [filterUserId, setFilterUserId]       = useState("")   // 担当者フィルター
  const [filterCompanyId, setFilterCompanyId] = useState("")   // 法人フィルター
  const [invoices, setInvoices]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)

  const [showPayModal, setShowPayModal]     = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)
  const [targetInv, setTargetInv] = useState<any>(null)
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState("")
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [taxMode, setTaxMode] = useState<"inc" | "ex">("ex")

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (yearMonth) p.set("yearMonth", yearMonth)
      else p.set("filter", filter)
      if (filterUserId)   p.set("assignedUserId", filterUserId)
      if (filterCompanyId) p.set("companyId", filterCompanyId)
      const res = await fetch(`/api/invoices?${p.toString()}`)
      if (!res.ok) { setInvoices([]); return }
      const text = await res.text()
      setInvoices(text ? JSON.parse(text) : [])
    } catch (e) {
      console.error("fetchInvoices error:", e)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [filter, yearMonth, filterUserId, filterCompanyId])

  useEffect(() => { if (pageTab === "issued") fetchInvoices() }, [fetchInvoices, pageTab])

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const handleConfirmPayment = async () => {
    if (!targetInv) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/invoices/${targetInv.id}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentDate: payDate, paymentAmount: Number(payAmount) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? "着金確認に失敗しました", false)
      } else {
        showToast("着金確認しました")
        fetchInvoices()
      }
    } catch {
      showToast("通信エラーが発生しました", false)
    } finally {
      setShowPayModal(false)
      setProcessing(false)
    }
  }

  const handleClear = async () => {
    if (!targetInv) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/invoices/${targetInv.id}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearedAt: new Date().toISOString() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? "消込処理に失敗しました", false)
      } else {
        showToast("消込処理が完了しました")
        fetchInvoices()
      }
    } catch {
      showToast("通信エラーが発生しました", false)
    } finally {
      setShowClearModal(false)
      setProcessing(false)
    }
  }

  const handleFreeeSync = async () => {
    setFreeeSync(true)
    try {
      const res = await fetch("/api/freee/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? "同期に失敗しました", false)
      } else {
        showToast(`同期完了: ${data.created}件追加 / ${data.skipped}件スキップ`)
        fetchInvoices()
      }
    } catch {
      showToast("通信エラーが発生しました", false)
    } finally {
      setFreeeSync(false)
    }
  }

  const handleDelete = async (inv: any) => {
    if (!confirm(`${inv.invoiceNumber} を削除しますか？`)) return
    const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" })
    if (!res.ok) showToast("削除に失敗しました", false)
    else fetchInvoices()
  }

  // ── 被請求書側 state ─────────────────────────────────────────────────────────
  const [rcvInvoices, setRcvInvoices]     = useState<any[]>([])
  const [rcvLoading, setRcvLoading]       = useState(true)
  const [showRcvModal, setShowRcvModal]     = useState(false)
  const [showSendModal, setShowSendModal]   = useState(false)
  const [showRcvDetail, setShowRcvDetail]   = useState(false)
  const [targetRcv, setTargetRcv]           = useState<any>(null)
  const [issuedInvoices, setIssuedInvoices] = useState<any[]>([])
  const [linkInvoiceId, setLinkInvoiceId]   = useState<string>("")
  const [linkProcessing, setLinkProcessing] = useState(false)
  const [isEditing, setIsEditing]           = useState(false)
  const [editForm, setEditForm]             = useState<any>({})
  const [sendDate, setSendDate]           = useState(new Date().toISOString().slice(0, 10))
  const [rcvProcessing, setRcvProcessing] = useState(false)

  const [rcvModalFile, setRcvModalFile] = useState<File | null>(null)
  const [rcvFilterUserId, setRcvFilterUserId] = useState("")
  const [rcvFilter, setRcvFilter]       = useState<Filter>("all")
  const [rcvYearMonth, setRcvYearMonth] = useState("")

  const [rcvForm, setRcvForm] = useState({
    invoiceNumber:  "",
    vendorName:     "",
    subject:        "",
    issueDate:      new Date().toISOString().slice(0, 10),
    dueDate:        new Date().toISOString().slice(0, 10),
    amount:         "",
    taxRate:        10,
    notes:          "",
    assignedUserId: "",
  })

  const fetchRcvInvoices = useCallback(async () => {
    setRcvLoading(true)
    try {
      const p = new URLSearchParams()
      if (rcvFilterUserId) p.set("assignedUserId", rcvFilterUserId)
      if (rcvYearMonth)    p.set("yearMonth", rcvYearMonth)
      else                 p.set("filter", rcvFilter)
      const res = await fetch(`/api/received-invoices?${p.toString()}`)
      if (res.ok) setRcvInvoices(await res.json())
    } catch (e) {
      console.error("fetchRcvInvoices error:", e)
    } finally {
      setRcvLoading(false)
    }
  }, [rcvFilterUserId, rcvFilter, rcvYearMonth])

  useEffect(() => { if (pageTab === "received") fetchRcvInvoices() }, [fetchRcvInvoices, pageTab])

  const handleRcvCreate = async () => {
    if (!rcvForm.vendorName || !rcvForm.subject || !rcvForm.amount) return
    setRcvProcessing(true)
    try {
      const res = await fetch("/api/received-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rcvForm, amount: Number(rcvForm.amount) }),
      })
      if (res.ok && rcvModalFile) {
        const created = await res.json()
        const fd = new FormData()
        fd.append("file", rcvModalFile)
        await fetch(`/api/received-invoices/${created.id}/upload-pdf`, { method: "POST", body: fd })
      }
    } finally {
      setShowRcvModal(false)
      setRcvModalFile(null)
      setRcvForm({ invoiceNumber: "", vendorName: "", subject: "", issueDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), amount: "", taxRate: 10, notes: "", assignedUserId: "" })
      setRcvProcessing(false)
      fetchRcvInvoices()
    }
  }

  const handleSendConfirm = async () => {
    if (!targetRcv) return
    setRcvProcessing(true)
    try {
      const res = await fetch(`/api/received-invoices/${targetRcv.id}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: sendDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? "送金確認に失敗しました", false)
      } else {
        showToast("送金確認しました")
        fetchRcvInvoices()
      }
    } catch {
      showToast("通信エラーが発生しました", false)
    } finally {
      setShowSendModal(false)
      setRcvProcessing(false)
    }
  }

  const handleRcvDelete = async (inv: any) => {
    if (!confirm(`${inv.vendorName} の被請求書を削除しますか？`)) return
    const res = await fetch(`/api/received-invoices/${inv.id}`, { method: "DELETE" })
    if (!res.ok) showToast("削除に失敗しました", false)
    else fetchRcvInvoices()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* トースト通知 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium transition-all ${
          toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}
      {/* ページタブ */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white border border-navy-100 rounded-lg p-1">
          <button onClick={() => setPageTab("issued")}
            className={`px-4 py-1.5 text-[12px] rounded-md transition-all font-medium ${pageTab === "issued" ? "bg-navy-900 text-white" : "text-navy-500 hover:bg-navy-50"}`}>
            請求書一覧
          </button>
          <button onClick={() => setPageTab("received")}
            className={`px-4 py-1.5 text-[12px] rounded-md transition-all font-medium ${pageTab === "received" ? "bg-navy-900 text-white" : "text-navy-500 hover:bg-navy-50"}`}>
            被請求書一覧
          </button>
        </div>

        {pageTab === "issued" ? (
          <div className="flex items-center gap-2">
            {freeeConnected ? (
              <button onClick={handleFreeeSync} disabled={freeeSync}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-[13px] font-medium rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={freeeSync ? "animate-spin" : ""} />
                {freeeSync ? "同期中..." : "freeeから同期"}
              </button>
            ) : (
              <a href="/api/freee/auth"
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-navy-200 text-navy-700 text-[13px] font-medium rounded-lg hover:bg-navy-50 transition-colors">
                <Link2 size={14} />freeeと連携
              </a>
            )}
            <Link href="/admin/invoices/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 transition-colors">
              <Plus size={14} />新規請求書を作成
            </Link>
          </div>
        ) : (
          <button onClick={() => setShowRcvModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 transition-colors">
            <Plus size={14} />被請求書を追加
          </button>
        )}
      </div>

      {/* ── 請求書一覧タブ ────────────────────────────────────────────────── */}
      {pageTab === "issued" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-white border border-navy-100 rounded-lg p-1">
              {TABS.map((t) => (
                <button key={t.value} onClick={() => { setYearMonth(""); setFilter(t.value) }}
                  className={`px-3 py-1.5 text-[12px] rounded-md transition-all ${
                    !yearMonth && filter === t.value ? "bg-navy-900 text-white font-medium" : "text-navy-500 hover:bg-navy-50"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-navy-400">月を指定</label>
              <input type="month" value={yearMonth} max={toYearMonth(new Date())}
                onChange={e => { setYearMonth(e.target.value); setFilter("all") }}
                className="px-2 py-1.5 text-[12px] border border-navy-200 rounded-lg text-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-400" />
              {yearMonth && (
                <button onClick={() => { setYearMonth(""); setFilter("all") }}
                  className="text-[11px] text-navy-400 hover:text-navy-700 px-2 py-1.5 border border-navy-200 rounded-lg">
                  クリア
                </button>
              )}
            </div>
            {/* 担当者フィルター */}
            <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
              className="px-2 py-1.5 text-[12px] border border-navy-200 rounded-lg text-navy-700 bg-white focus:outline-none focus:ring-1 focus:ring-navy-400">
              <option value="">担当者：全員</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* 集計サマリーバー */}
          {!loading && invoices.length > 0 && (() => {
            const withProfit = invoices.filter((inv: any) => inv.profit)
            const totalSales  = taxMode === "ex"
              ? withProfit.reduce((s: number, inv: any) => s + Number(inv.subtotal ?? 0), 0)
              : withProfit.reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0)
            const totalCost   = taxMode === "ex"
              ? withProfit.reduce((s: number, inv: any) => s + Number(inv.profit.cost ?? 0), 0)
              : withProfit.reduce((s: number, inv: any) => s + Math.round(Number(inv.profit.cost ?? 0) * 1.1), 0)
            const totalProfit = totalSales - totalCost
            const profitRate  = totalSales > 0 ? (totalProfit / totalSales * 100) : 0
            return (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: `売上合計（${taxMode === "ex" ? "税別" : "税込"}）`, value: yen(totalSales), color: "text-navy-900" },
                  { label: `原価合計（${taxMode === "ex" ? "税別" : "税込"}）`, value: yen(totalCost),  color: "text-navy-700" },
                  { label: `利益合計（${taxMode === "ex" ? "税別" : "税込"}）`, value: yen(totalProfit), color: totalProfit >= 0 ? "text-emerald-700" : "text-red-600" },
                  { label: "平均利益率", value: `${profitRate.toFixed(1)}%`, color: profitRate >= 30 ? "text-emerald-700" : "text-amber-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white border border-navy-100 rounded-lg px-4 py-3">
                    <p className="text-[10.5px] text-navy-400 mb-1">{label}</p>
                    <p className={`text-[16px] font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-[9.5px] text-navy-300 mt-0.5">対象: {withProfit.length}件</p>
                  </div>
                ))}
              </div>
            )
          })()}

          <div className="bg-white rounded-lg border border-navy-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-100">
              <h2 className="text-[13px] font-medium text-navy-900">請求書一覧</h2>
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5 bg-navy-50 border border-navy-100 rounded-md p-0.5">
                  <button onClick={() => setTaxMode("ex")}
                    className={`px-2.5 py-1 text-[11px] rounded transition-all font-medium ${taxMode === "ex" ? "bg-white text-navy-900 shadow-sm" : "text-navy-400 hover:text-navy-600"}`}>
                    税別
                  </button>
                  <button onClick={() => setTaxMode("inc")}
                    className={`px-2.5 py-1 text-[11px] rounded transition-all font-medium ${taxMode === "inc" ? "bg-white text-navy-900 shadow-sm" : "text-navy-400 hover:text-navy-600"}`}>
                    税込
                  </button>
                </div>
                <span className="text-[11px] text-navy-400">{invoices.length}件</span>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-navy-400 text-[13px]">読み込み中...</div>
            ) : (
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-navy-50">
                    {["請求書番号","得意先","件名","請求日","支払期限",`請求金額（${taxMode === "ex" ? "税別" : "税込"}）`,"利益額","利益率","ステータス","操作"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10.5px] text-navy-400 font-medium uppercase tracking-wider border-b border-navy-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const salesAmt  = taxMode === "ex" ? Number(inv.subtotal ?? 0) : Number(inv.amount ?? 0)
                    const costAmt   = inv.profit
                      ? (taxMode === "ex" ? Number(inv.profit.cost ?? 0) : Math.round(Number(inv.profit.cost ?? 0) * 1.1))
                      : null
                    const profitAmt = costAmt !== null ? salesAmt - costAmt : null
                    return (
                    <tr key={inv.id} className="hover:bg-navy-50 border-b border-navy-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-navy-900 font-mono text-[11.5px]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-navy-700">{inv.company?.name}</td>
                      <td className="px-4 py-3 text-navy-600 max-w-[120px] truncate">{inv.subject}</td>
                      <td className="px-4 py-3 text-navy-400">{date(inv.issueDate)}</td>
                      <td className={`px-4 py-3 font-medium ${inv.status === "OVERDUE" ? "text-red-700" : "text-navy-400"}`}>{date(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-navy-900 tabular-nums">{yen(salesAmt)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {profitAmt !== null ? (
                          <span className={`font-medium ${profitAmt >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {yen(profitAmt)}
                          </span>
                        ) : <span className="text-navy-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.profit ? (
                          <span className={`font-medium ${Number(inv.profit.profitRate) >= 30 ? "text-emerald-700" : "text-amber-700"}`}>
                            {Number(inv.profit.profitRate).toFixed(1)}%
                          </span>
                        ) : <span className="text-navy-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} role="ADMIN" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {(inv.status === "ISSUED" || inv.status === "PENDING" || inv.status === "OVERDUE") && (
                            <button onClick={() => { setTargetInv(inv); setPayAmount(String(inv.amount)); setShowPayModal(true) }}
                              className="text-[11px] px-2.5 py-1.5 bg-gold-50 border border-gold-300 text-gold-700 rounded-md hover:bg-gold-100 transition-colors whitespace-nowrap">
                              着金確認
                            </button>
                          )}
                          {inv.status === "PAYMENT_CONFIRMED" && (
                            <button onClick={() => { setTargetInv(inv); setShowClearModal(true) }}
                              className="text-[11px] px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap">
                              消込処理
                            </button>
                          )}
                          <Link href={`/admin/invoices/${inv.id}`}
                            className="text-[11px] px-2.5 py-1.5 border border-navy-200 text-navy-600 rounded-md hover:bg-navy-50 transition-colors">
                            詳細
                          </Link>
                          <button onClick={() => handleDelete(inv)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                  {invoices.length === 0 && (
                    <tr><td colSpan={10} className="text-center text-navy-400 py-12 text-[13px]">
                      請求書がありません。上の「新規請求書を作成」から登録してください。
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── 被請求書一覧タブ ──────────────────────────────────────────────── */}
      {pageTab === "received" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 期間フィルタータブ */}
            <div className="flex gap-1 bg-white border border-navy-100 rounded-lg p-1">
              {TABS.filter(t => t.value !== "uncleared").map((t) => (
                <button key={t.value} onClick={() => { setRcvYearMonth(""); setRcvFilter(t.value) }}
                  className={`px-3 py-1.5 text-[12px] rounded-md transition-all ${
                    !rcvYearMonth && rcvFilter === t.value ? "bg-navy-900 text-white font-medium" : "text-navy-500 hover:bg-navy-50"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* 月指定 */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-navy-400">月を指定</label>
              <input type="month" value={rcvYearMonth}
                onChange={e => { setRcvYearMonth(e.target.value); setRcvFilter("all") }}
                className="px-2 py-1.5 text-[12px] border border-navy-200 rounded-lg text-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-400" />
              {rcvYearMonth && (
                <button onClick={() => { setRcvYearMonth(""); setRcvFilter("all") }}
                  className="text-[11px] text-navy-400 hover:text-navy-700 px-2 py-1.5 border border-navy-200 rounded-lg">
                  クリア
                </button>
              )}
            </div>
            {/* 担当者フィルター */}
            <select
              value={rcvFilterUserId}
              onChange={e => setRcvFilterUserId(e.target.value)}
              className="px-2 py-1.5 text-[12px] border border-navy-200 rounded-lg text-navy-700 bg-white focus:outline-none focus:ring-1 focus:ring-navy-400">
              <option value="">担当者：全員</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-lg border border-navy-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-100">
            <h2 className="text-[13px] font-medium text-navy-900">被請求書一覧（経費）</h2>
            <span className="text-[11px] text-navy-400">{rcvInvoices.length}件</span>
          </div>
          {rcvLoading ? (
            <div className="flex items-center justify-center py-16 text-navy-400 text-[13px]">読み込み中...</div>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-navy-50">
                  {["請求書番号","取引先（請求元）","件名","請求日","支払期限","金額","ステータス","操作"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10.5px] text-navy-400 font-medium uppercase tracking-wider border-b border-navy-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rcvInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-navy-50 border-b border-navy-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-[11.5px] text-navy-500">{inv.invoiceNumber || "—"}</td>
                    <td className="px-4 py-3 font-medium text-navy-900">{inv.vendorName}</td>
                    <td className="px-4 py-3 text-navy-600 max-w-[140px] truncate">{inv.subject}</td>
                    <td className="px-4 py-3 text-navy-400">{date(inv.issueDate)}</td>
                    <td className={`px-4 py-3 font-medium ${inv.status === "UNPAID" && new Date(inv.dueDate) < new Date() ? "text-red-700" : "text-navy-400"}`}>
                      {date(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-navy-900 tabular-nums">{yen(inv.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium`}
                        style={{ background: RCV_STATUS[inv.status]?.color + "18", color: RCV_STATUS[inv.status]?.color }}>
                        {RCV_STATUS[inv.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {inv.status === "UNPAID" && (
                          <button onClick={() => { setTargetRcv(inv); setSendDate(new Date().toISOString().slice(0, 10)); setShowSendModal(true) }}
                            className="text-[11px] px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap">
                            送金確認
                          </button>
                        )}
                        <button onClick={async () => {
                            setTargetRcv(inv)
                            setLinkInvoiceId(inv.invoiceId ?? "")
                            if (issuedInvoices.length === 0) {
                              const r = await fetch("/api/invoices?filter=all")
                              if (r.ok) setIssuedInvoices(await r.json())
                            }
                            setShowRcvDetail(true)
                          }}
                          className="text-[11px] px-2.5 py-1.5 border border-navy-200 text-navy-600 rounded-md hover:bg-navy-50 transition-colors whitespace-nowrap">
                          詳細
                        </button>
                        <button onClick={() => handleRcvDelete(inv)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rcvInvoices.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-navy-400 py-12 text-[13px]">
                    被請求書がありません。「被請求書を追加」から登録してください。
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
          </div>
        </>
      )}

      {/* ── 請求書：着金確認モーダル ────────────────────────────────────────── */}
      {showPayModal && targetInv && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setShowPayModal(false)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[420px] shadow-xl">
            <h2 className="text-[15px] font-medium text-navy-900 mb-4">着金確認</h2>
            <p className="text-[12px] text-navy-500 mb-4">{targetInv.invoiceNumber} - {targetInv.company?.name}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">入金日</label>
                <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                  value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">入金額</label>
                <input type="number" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => setShowPayModal(false)} className="px-4 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600">キャンセル</button>
              <button onClick={handleConfirmPayment} disabled={processing}
                className="px-4 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
                {processing ? "処理中..." : "着金確認する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 請求書：消込モーダル ─────────────────────────────────────────────── */}
      {showClearModal && targetInv && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setShowClearModal(false)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[420px] shadow-xl">
            <h2 className="text-[15px] font-medium text-navy-900 mb-4">消込処理</h2>
            <p className="text-[12px] text-navy-500 mb-2">{targetInv.invoiceNumber} - {targetInv.company?.name}</p>
            <p className="text-[12px] text-navy-400 mb-4 bg-navy-50 rounded-lg p-3">
              着金確認済みの請求書を消込処理します。取引先ポータルに「処理済」として表示されます。
            </p>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => setShowClearModal(false)} className="px-4 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600">キャンセル</button>
              <button onClick={handleClear} disabled={processing}
                className="px-4 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
                {processing ? "処理中..." : "消込実行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 被請求書：新規入力モーダル ───────────────────────────────────────── */}
      {showRcvModal && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setShowRcvModal(false)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[480px] shadow-xl">
            <h2 className="text-[15px] font-medium text-navy-900 mb-4">被請求書を追加</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">請求書番号（任意）</label>
                  <input type="text" placeholder="例：INV-001"
                    className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={rcvForm.invoiceNumber} onChange={e => setRcvForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">取引先（請求元）*</label>
                  <input type="text" placeholder="例：株式会社〇〇"
                    className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={rcvForm.vendorName} onChange={e => setRcvForm(f => ({ ...f, vendorName: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">件名 *</label>
                <input type="text" placeholder="例：2026年3月分 業務委託費"
                  className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                  value={rcvForm.subject} onChange={e => setRcvForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">請求日 *</label>
                  <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={rcvForm.issueDate} onChange={e => setRcvForm(f => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">支払期限 *</label>
                  <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={rcvForm.dueDate} onChange={e => setRcvForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">金額（税込）*</label>
                  <input type="number" placeholder="0"
                    className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={rcvForm.amount} onChange={e => setRcvForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">消費税率</label>
                  <select className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] bg-white"
                    value={rcvForm.taxRate} onChange={e => setRcvForm(f => ({ ...f, taxRate: Number(e.target.value) }))}>
                    <option value={10}>10%</option>
                    <option value={8}>8%（軽減）</option>
                    <option value={0}>0%（非課税）</option>
                  </select>
                </div>
              </div>
              {rcvForm.amount && (
                <div className="flex gap-4 px-3 py-2 bg-navy-50 rounded-lg text-[11px] text-navy-600 tabular-nums">
                  {(() => {
                    const inc = Number(rcvForm.amount)
                    const ex  = Math.floor(inc / (1 + rcvForm.taxRate / 100))
                    const tax = inc - ex
                    return (
                      <>
                        <span>税込：¥{inc.toLocaleString("ja-JP")}</span>
                        <span className="text-navy-400">／</span>
                        <span>税抜：¥{ex.toLocaleString("ja-JP")}</span>
                        <span className="text-navy-400">／</span>
                        <span>消費税：¥{tax.toLocaleString("ja-JP")}</span>
                      </>
                    )
                  })()}
                </div>
              )}
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">担当者</label>
                <select className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] bg-white"
                  value={rcvForm.assignedUserId}
                  onChange={e => setRcvForm(f => ({ ...f, assignedUserId: e.target.value }))}>
                  <option value="">未設定</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">請求書ファイル（PDF / 画像・任意）</label>
                <FileDropZone
                  onFile={f => setRcvModalFile(f)}
                  currentFileName={rcvModalFile?.name}
                  compact
                />
                {rcvModalFile && (
                  <button type="button" onClick={() => setRcvModalFile(null)}
                    className="mt-1 text-[10px] text-red-400 hover:text-red-600">
                    選択を解除
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">備考</label>
                <textarea rows={2} className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] resize-none"
                  value={rcvForm.notes} onChange={e => setRcvForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => { setShowRcvModal(false); setRcvModalFile(null) }} className="px-4 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600">キャンセル</button>
              <button onClick={handleRcvCreate} disabled={rcvProcessing || !rcvForm.vendorName || !rcvForm.subject || !rcvForm.amount}
                className="px-4 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
                {rcvProcessing ? "登録中..." : "登録する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 被請求書：詳細モーダル ──────────────────────────────────────────── */}
      {showRcvDetail && targetRcv && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && (setShowRcvDetail(false), setIsEditing(false))}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[540px] shadow-xl max-h-[90vh] overflow-y-auto">

            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-medium text-navy-900">
                被請求書 {isEditing ? "編集" : "詳細"}
              </h2>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: RCV_STATUS[targetRcv.status]?.color + "18", color: RCV_STATUS[targetRcv.status]?.color }}>
                  {RCV_STATUS[targetRcv.status]?.label}
                </span>
                {!isEditing && (
                  <button
                    onClick={() => { setIsEditing(true); setEditForm({
                      invoiceNumber: targetRcv.invoiceNumber ?? "",
                      vendorName:    targetRcv.vendorName,
                      subject:       targetRcv.subject,
                      issueDate:     String(targetRcv.issueDate).slice(0, 10),
                      dueDate:       String(targetRcv.dueDate).slice(0, 10),
                      amount:        String(targetRcv.amount),
                      notes:         targetRcv.notes ?? "",
                    }) }}
                    className="px-3 py-1 text-[11px] font-medium border border-navy-200 text-navy-600 rounded-lg hover:bg-navy-50"
                  >
                    編集
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              /* ── 編集フォーム ── */
              <div className="space-y-3 text-[13px]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">請求書番号（任意）</label>
                    <input type="text" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                      value={editForm.invoiceNumber} onChange={e => setEditForm((f: any) => ({ ...f, invoiceNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">取引先（請求元）*</label>
                    <input type="text" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                      value={editForm.vendorName} onChange={e => setEditForm((f: any) => ({ ...f, vendorName: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">件名 *</label>
                  <input type="text" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={editForm.subject} onChange={e => setEditForm((f: any) => ({ ...f, subject: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">請求日</label>
                    <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                      value={editForm.issueDate} onChange={e => setEditForm((f: any) => ({ ...f, issueDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">支払期限</label>
                    <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                      value={editForm.dueDate} onChange={e => setEditForm((f: any) => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">金額（税込）*</label>
                  <input type="number" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                    value={editForm.amount} onChange={e => setEditForm((f: any) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">備考</label>
                  <textarea rows={2} className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] resize-none"
                    value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600">キャンセル</button>
                  <button
                    disabled={rcvProcessing || !editForm.vendorName || !editForm.subject || !editForm.amount}
                    onClick={async () => {
                      setRcvProcessing(true)
                      const res = await fetch(`/api/received-invoices/${targetRcv.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          invoiceNumber: editForm.invoiceNumber || null,
                          vendorName:    editForm.vendorName,
                          subject:       editForm.subject,
                          issueDate:     editForm.issueDate,
                          dueDate:       editForm.dueDate,
                          amount:        Number(editForm.amount),
                          notes:         editForm.notes || null,
                        }),
                      })
                      if (res.ok) {
                        const updated = await res.json()
                        setTargetRcv({ ...targetRcv, ...updated })
                        setIsEditing(false)
                        fetchRcvInvoices()
                      }
                      setRcvProcessing(false)
                    }}
                    className="px-4 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
                    {rcvProcessing ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── 詳細表示 ── */
              <div className="space-y-0 text-[13px]">
                {targetRcv.invoiceNumber && (
                  <div className="flex justify-between py-2 border-b border-navy-50">
                    <span className="text-navy-400">請求書番号</span>
                    <span className="font-mono text-navy-700">{targetRcv.invoiceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">取引先（請求元）</span>
                  <span className="font-medium text-navy-900">{targetRcv.vendorName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">件名</span>
                  <span className="text-navy-700 text-right max-w-[280px]">{targetRcv.subject}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">請求日</span>
                  <span className="text-navy-700">{date(String(targetRcv.issueDate))}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">支払期限</span>
                  <span className={`font-medium ${targetRcv.status === "UNPAID" && new Date(String(targetRcv.dueDate)) < new Date() ? "text-red-600" : "text-navy-700"}`}>
                    {date(String(targetRcv.dueDate))}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">金額（税込）</span>
                  <span className="font-medium text-navy-900 tabular-nums">{yen(Number(targetRcv.amount))}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-navy-50">
                  <span className="text-navy-400">税抜金額</span>
                  <span className="text-navy-600 tabular-nums">{yen(Math.round(Number(targetRcv.amount) / 1.1))}</span>
                </div>
                {targetRcv.paidAt && (
                  <div className="flex justify-between py-2 border-b border-navy-50">
                    <span className="text-navy-400">送金日</span>
                    <span className="text-emerald-700 font-medium">{date(String(targetRcv.paidAt))}</span>
                  </div>
                )}
                {targetRcv.notes && (
                  <div className="py-2">
                    <p className="text-navy-400 mb-1">備考</p>
                    <p className="text-navy-700 bg-navy-50 rounded-lg px-3 py-2 text-[12px]">{targetRcv.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* 紐づけセクション（編集中でも表示） */}
            {!isEditing && (
              <div className="mt-4 pt-4 border-t border-navy-100">
                <p className="text-[11px] text-navy-400 uppercase tracking-wider mb-2">紐づける発行請求書（売上）</p>

                {/* 現在の紐づき表示 */}
                {targetRcv.invoiceId && (() => {
                  const linked = issuedInvoices.find((i: any) => i.id === targetRcv.invoiceId)
                  return linked ? (
                    <p className="text-[12px] text-emerald-700 font-medium bg-emerald-50 rounded-lg px-3 py-2 mb-2">
                      ✓ {linked.invoiceNumber}（{linked.company?.name}）と紐づけ済み
                    </p>
                  ) : (
                    <p className="text-[12px] text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 mb-2">✓ 紐づけ済み</p>
                  )
                })()}

                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 border border-navy-200 rounded-lg text-[12px] text-navy-700"
                    value={linkInvoiceId}
                    onChange={e => setLinkInvoiceId(e.target.value)}
                  >
                    <option value="">— 紐づけなし —</option>
                    {issuedInvoices.map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber}｜{inv.company?.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={linkProcessing}
                    onClick={async () => {
                      setLinkProcessing(true)
                      const res = await fetch(`/api/received-invoices/${targetRcv.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ invoiceId: linkInvoiceId || null }),
                      })
                      if (res.ok) {
                        const updated = await res.json()
                        setTargetRcv({ ...targetRcv, invoiceId: updated.invoiceId })
                        fetchRcvInvoices()
                      }
                      setLinkProcessing(false)
                    }}
                    className="px-4 py-2 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-60 whitespace-nowrap"
                  >
                    {linkProcessing ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => { setShowRcvDetail(false); setIsEditing(false) }}
                className="px-5 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 被請求書：送金確認モーダル ───────────────────────────────────────── */}
      {showSendModal && targetRcv && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setShowSendModal(false)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[420px] shadow-xl">
            <h2 className="text-[15px] font-medium text-navy-900 mb-4">送金確認</h2>
            <p className="text-[12px] text-navy-500 mb-4">{targetRcv.vendorName} — {targetRcv.subject}</p>
            <p className="text-[13px] font-medium text-navy-900 mb-4">{yen(targetRcv.amount)}</p>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">送金日</label>
              <input type="date" className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px]"
                value={sendDate} onChange={e => setSendDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => setShowSendModal(false)} className="px-4 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600">キャンセル</button>
              <button onClick={handleSendConfirm} disabled={rcvProcessing}
                className="px-4 py-2 text-[13px] bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-60">
                {rcvProcessing ? "処理中..." : "送金済みにする"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
