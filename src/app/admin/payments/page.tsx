"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Clipboard, Landmark, RefreshCw, Send } from "lucide-react"

type BankInfo = {
  companyId: string
  bankName?: string | null
  bankBranch?: string | null
  bankAccountType?: string | null
  bankAccountNumber?: string | null
  bankAccountHolder?: string | null
  bankAccountMemo?: string | null
  copyText: string
}

type CashflowGroup = {
  name: string
  total: number
  paid: number
  unpaid: number
  count: number
  unpaidCount: number
  bank?: BankInfo | null
  items: {
    id: string
    invoiceNumber?: string | null
    subject: string
    dueDate: string
    amount: number
    status: string
  }[]
}

type CashflowData = {
  outgoing: {
    total: number
    paid: number
    unpaid: number
    vendorCount: number
    invoiceCount: number
    unpaidCount: number
    groups: CashflowGroup[]
  }
}

const yen = (value: number) => `¥${Number(value ?? 0).toLocaleString("ja-JP")}`
const date = (value: string) => new Date(value).toLocaleDateString("ja-JP")
const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function SummaryCard({
  label,
  value,
  note,
  tone = "navy",
  icon,
}: {
  label: string
  value: string
  note?: string
  tone?: "navy" | "green" | "red"
  icon: ReactNode
}) {
  const colors = {
    navy: "text-navy-900 bg-navy-50 border-navy-100",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100",
    red: "text-red-700 bg-red-50 border-red-100",
  }

  return (
    <div className="bg-white border border-navy-100 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] text-navy-400 uppercase tracking-[0.06em] mb-1">{label}</p>
          <p className="text-[22px] font-semibold text-navy-900 tabular-nums">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${colors[tone]}`}>
          {icon}
        </div>
      </div>
      {note && <p className="text-[11px] text-navy-400 mt-2">{note}</p>}
    </div>
  )
}

function BankPanel({ group, onCopy }: { group: CashflowGroup; onCopy: (text: string) => void }) {
  const bank = group.bank
  const hasBank = Boolean(bank?.bankName || bank?.bankAccountNumber || bank?.bankAccountHolder)

  if (!hasBank) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12px]">
        <p className="font-medium text-amber-800">口座未登録</p>
        <p className="text-amber-700 mt-1">取引先管理で銀行口座を登録すると、ここに表示されます。</p>
        <Link href="/admin/companies" className="inline-block text-amber-800 underline mt-2">
          取引先管理へ
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-navy-400 uppercase tracking-[0.06em] mb-1">送金先口座</p>
          <p className="text-[13px] font-medium text-navy-900">
            {[bank?.bankName, bank?.bankBranch].filter(Boolean).join(" ")}
          </p>
          <p className="text-[12px] text-navy-700 mt-1 tabular-nums">
            {[bank?.bankAccountType, bank?.bankAccountNumber].filter(Boolean).join(" ")}
          </p>
          {bank?.bankAccountHolder && <p className="text-[12px] text-navy-700 mt-1">{bank.bankAccountHolder}</p>}
          {bank?.bankAccountMemo && <p className="text-[11px] text-navy-400 mt-1">{bank.bankAccountMemo}</p>}
        </div>
        <button className="btn btn-sm bg-white" onClick={() => onCopy(bank?.copyText ?? "")}>
          <Clipboard size={13} />
          コピー
        </button>
      </div>
    </div>
  )
}

export default function AdminPaymentsPage() {
  const [yearMonth, setYearMonth] = useState(currentMonth)
  const [data, setData] = useState<CashflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/monthly-cashflow?yearMonth=${encodeURIComponent(yearMonth)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "支払予定の取得に失敗しました")
      setData(body)
    } catch (error: any) {
      showToast(error?.message ?? "支払予定の取得に失敗しました", false)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const unpaidGroups = useMemo(() => {
    return (data?.outgoing.groups ?? [])
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.status === "UNPAID"),
      }))
      .filter(group => group.unpaid > 0)
  }, [data])

  const unpaidVendorCount = unpaidGroups.length

  const copyBank = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      showToast("口座情報をコピーしました")
    } catch {
      showToast("コピーできませんでした", false)
    }
  }

  const markPaid = async (invoiceId: string) => {
    setProcessingId(invoiceId)
    try {
      const res = await fetch(`/api/received-invoices/${invoiceId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString().slice(0, 10) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "送金済みへの更新に失敗しました")
      showToast("送金済みにしました")
      fetchData()
    } catch (error: any) {
      showToast(error?.message ?? "送金済みへの更新に失敗しました", false)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium ${
          toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-navy-900">支払予定</h1>
          <p className="text-[13px] text-navy-400 mt-1">
            月末にこれから振り込む金額と送金先口座だけを確認できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={event => setYearMonth(event.target.value)}
            className="form-input w-[150px]"
          />
          <button className="btn bg-white" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            更新
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-navy-900">今月の振込</h2>
          <p className="text-[12px] text-navy-400">
            {data ? `${unpaidVendorCount}社 / 未送金 ${data.outgoing.unpaidCount}件` : "読み込み中"}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SummaryCard
            label="今回振込む額"
            value={data ? yen(data.outgoing.unpaid) : "..."}
            note={data ? `未送金 ${data.outgoing.unpaidCount}件` : undefined}
            tone={data && data.outgoing.unpaid > 0 ? "red" : "green"}
            icon={<Send size={18} />}
          />
          <SummaryCard
            label="送金済額"
            value={data ? yen(data.outgoing.paid) : "..."}
            note="すでに送金済みにした金額"
            tone="green"
            icon={<CheckCircle2 size={18} />}
          />
          <SummaryCard
            label="月内支払予定総額"
            value={data ? yen(data.outgoing.total) : "..."}
            note="送金済みと未送金の合計"
            tone="navy"
            icon={<Landmark size={18} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-navy-900">これから振り込む先</h2>
        {loading ? (
          <div className="card p-10 text-center text-[13px] text-navy-400">読み込み中...</div>
        ) : unpaidGroups.length === 0 ? (
          <div className="card p-10 text-center text-[13px] text-navy-400">この月の未送金はありません。</div>
        ) : (
          <div className="space-y-3">
            {unpaidGroups.map(group => (
              <div key={group.name} className="card">
                <div className="px-5 py-4 border-b border-navy-100 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold text-navy-900">{group.name}</p>
                    <p className="text-[12px] text-navy-400 mt-1">未送金 {group.unpaidCount}件</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-navy-400">今回振込む額</p>
                    <p className="text-[20px] font-semibold text-red-700 tabular-nums">{yen(group.unpaid)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 p-5">
                  <BankPanel group={group} onCopy={copyBank} />
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>支払期限</th>
                          <th>件名</th>
                          <th style={{ textAlign: "right" }}>金額</th>
                          <th style={{ textAlign: "right" }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(item => (
                          <tr key={item.id}>
                            <td className="tabular-nums whitespace-nowrap">{date(item.dueDate)}</td>
                            <td>
                              <div className="font-medium text-navy-800 truncate max-w-[440px]">{item.subject}</div>
                              <div className="text-[11px] text-navy-300 font-mono">{item.invoiceNumber || "番号なし"}</div>
                            </td>
                            <td className="amount">{yen(item.amount)}</td>
                            <td className="text-right">
                              <button
                                className="btn btn-sm btn-outline-gold"
                                onClick={() => markPaid(item.id)}
                                disabled={processingId === item.id}
                              >
                                {processingId === item.id ? "更新中..." : "送金済みにする"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
