"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Calculator, CheckCircle2, Percent, RefreshCw, TrendingUp, Wallet } from "lucide-react"

type ProfitItem = {
  id: string
  invoiceNumber: string
  companyName: string
  subject: string
  issueDate: string
  dueDate: string
  sales: number
  cost: number
  grossProfit: number
  amount: number
  status: string
  hasProfit: boolean
}

type ProfitGroup = {
  userId: string
  userName: string
  sales: number
  cost: number
  grossProfit: number
  amount: number
  confirmedAmount: number
  unconfirmedAmount: number
  invoiceCount: number
  missingProfitCount: number
  profitRate: number
  items: ProfitItem[]
}

type ProfitData = {
  totals: Omit<ProfitGroup, "userId" | "userName" | "items">
  groups: ProfitGroup[]
}

const yen = (value: number) => `¥${Math.round(Number(value ?? 0)).toLocaleString("ja-JP")}`
const pct = (value: number) => `${Number(value ?? 0).toFixed(1)}%`
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
  tone?: "navy" | "green" | "amber" | "blue"
  icon: ReactNode
}) {
  const colors = {
    navy: "text-navy-900 bg-navy-50 border-navy-100",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100",
    amber: "text-gold-700 bg-gold-50 border-gold-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
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

function StatusPill({ status }: { status: string }) {
  if (status === "CLEARED") return <span className="badge badge-green">消込済み</span>
  if (status === "PAYMENT_CONFIRMED") return <span className="badge badge-blue">着金確認済み</span>
  if (status === "OVERDUE") return <span className="badge badge-red">期限超過</span>
  return <span className="badge badge-amber">未着金</span>
}

export default function AdminProfitsPage() {
  const [yearMonth, setYearMonth] = useState(currentMonth)
  const [commissionRate, setCommissionRate] = useState(10)
  const [data, setData] = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/profit-by-user?yearMonth=${encodeURIComponent(yearMonth)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "担当者別利益の取得に失敗しました")
      setData(body)
    } catch (error: any) {
      showToast(error?.message ?? "担当者別利益の取得に失敗しました", false)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const groups = useMemo(() => data?.groups ?? [], [data])
  const estimatedTotalCommission = data ? data.totals.grossProfit * (commissionRate / 100) : 0

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
          <h1 className="text-[22px] font-semibold text-navy-900">担当者別利益</h1>
          <p className="text-[13px] text-navy-400 mt-1">
            請求日ベースで担当者ごとの売上・原価・粗利・概算歩合を確認できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={event => setYearMonth(event.target.value)}
            className="form-input w-[150px]"
          />
          <div className="flex items-center gap-1 bg-white border border-navy-200 rounded-lg px-3 py-2">
            <Percent size={14} className="text-navy-400" />
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commissionRate}
              onChange={event => setCommissionRate(Number(event.target.value) || 0)}
              className="w-[64px] text-[13px] text-right outline-none tabular-nums"
            />
          </div>
          <button className="btn bg-white" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            更新
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-navy-900">全体サマリー</h2>
          <p className="text-[12px] text-navy-400">
            {data ? `${groups.length}名 / ${data.totals.invoiceCount}件` : "読み込み中"}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryCard
            label="売上"
            value={data ? yen(data.totals.sales) : "..."}
            note="税抜売上"
            tone="blue"
            icon={<Wallet size={18} />}
          />
          <SummaryCard
            label="粗利"
            value={data ? yen(data.totals.grossProfit) : "..."}
            note={data ? `粗利率 ${pct(data.totals.profitRate)}` : undefined}
            tone="green"
            icon={<TrendingUp size={18} />}
          />
          <SummaryCard
            label="概算歩合"
            value={data ? yen(estimatedTotalCommission) : "..."}
            note={`粗利 × ${commissionRate}%`}
            tone="amber"
            icon={<Calculator size={18} />}
          />
          <SummaryCard
            label="着金確認済"
            value={data ? yen(data.totals.confirmedAmount) : "..."}
            note={data ? `未着金 ${yen(data.totals.unconfirmedAmount)}` : undefined}
            tone="green"
            icon={<CheckCircle2 size={18} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-navy-900">担当者別</h2>
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>担当者</th>
                <th style={{ textAlign: "right" }}>売上</th>
                <th style={{ textAlign: "right" }}>原価</th>
                <th style={{ textAlign: "right" }}>粗利</th>
                <th style={{ textAlign: "right" }}>粗利率</th>
                <th style={{ textAlign: "right" }}>概算歩合</th>
                <th style={{ textAlign: "right" }}>件数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-navy-400 py-8">読み込み中...</td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-navy-400 py-8">この月の利益データはありません。</td>
                </tr>
              ) : groups.map(group => (
                <tr key={group.userId}>
                  <td className="primary">
                    {group.userName}
                    {group.missingProfitCount > 0 && (
                      <span className="ml-2 badge badge-amber">利益未入力 {group.missingProfitCount}件</span>
                    )}
                  </td>
                  <td className="amount">{yen(group.sales)}</td>
                  <td className="amount">{yen(group.cost)}</td>
                  <td className="amount text-emerald-700">{yen(group.grossProfit)}</td>
                  <td className="amount">{pct(group.profitRate)}</td>
                  <td className="amount text-gold-700">{yen(group.grossProfit * (commissionRate / 100))}</td>
                  <td className="text-right tabular-nums">{group.invoiceCount}件</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-navy-900">請求書明細</h2>
          <div className="space-y-3">
            {groups.map(group => (
              <div key={group.userId} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-navy-900">{group.userName}</p>
                    <p className="text-[12px] text-navy-400 mt-1">{group.invoiceCount}件</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-navy-400">粗利</p>
                    <p className="text-[18px] font-semibold text-emerald-700 tabular-nums">{yen(group.grossProfit)}</p>
                  </div>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>請求日</th>
                      <th>請求書番号</th>
                      <th>取引先</th>
                      <th>件名</th>
                      <th style={{ textAlign: "right" }}>売上</th>
                      <th style={{ textAlign: "right" }}>原価</th>
                      <th style={{ textAlign: "right" }}>粗利</th>
                      <th>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.id}>
                        <td className="tabular-nums whitespace-nowrap">{date(item.issueDate)}</td>
                        <td>
                          <Link href={`/admin/invoices/${item.id}`} className="font-mono text-[11px] text-blue-700 hover:underline">
                            {item.invoiceNumber}
                          </Link>
                        </td>
                        <td className="font-medium text-navy-800">{item.companyName}</td>
                        <td className="max-w-[280px] truncate">
                          {item.subject}
                          {!item.hasProfit && <span className="ml-2 badge badge-amber">利益未入力</span>}
                        </td>
                        <td className="amount">{yen(item.sales)}</td>
                        <td className="amount">{yen(item.cost)}</td>
                        <td className="amount text-emerald-700">{yen(item.grossProfit)}</td>
                        <td><StatusPill status={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
