"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, CheckCircle2, RefreshCw, Wallet } from "lucide-react"

type CollectionGroup = {
  name: string
  total: number
  confirmed: number
  unconfirmed: number
  count: number
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
  incoming: {
    total: number
    confirmed: number
    unconfirmed: number
    companyCount: number
    invoiceCount: number
    groups: CollectionGroup[]
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
  return <span className="badge badge-amber">未着金</span>
}

export default function AdminCollectionsPage() {
  const [yearMonth, setYearMonth] = useState(currentMonth)
  const [data, setData] = useState<CashflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/monthly-cashflow?yearMonth=${encodeURIComponent(yearMonth)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "入金予定の取得に失敗しました")
      setData(body)
    } catch (error: any) {
      showToast(error?.message ?? "入金予定の取得に失敗しました", false)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const groups = useMemo(() => data?.incoming.groups.filter(group => group.total > 0) ?? [], [data])

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
          <h1 className="text-[22px] font-semibold text-navy-900">入金予定</h1>
          <p className="text-[13px] text-navy-400 mt-1">
            月ごとにどの会社からいくら入金予定かを確認できます。
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
          <h2 className="text-[15px] font-semibold text-navy-900">今月の入金</h2>
          <p className="text-[12px] text-navy-400">
            {data ? `${data.incoming.companyCount}社 / ${data.incoming.invoiceCount}件` : "読み込み中"}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SummaryCard
            label="入金予定額"
            value={data ? yen(data.incoming.total) : "..."}
            note="対象月の支払期限ベース"
            tone="blue"
            icon={<ArrowDownToLine size={18} />}
          />
          <SummaryCard
            label="着金確認済額"
            value={data ? yen(data.incoming.confirmed) : "..."}
            note="着金確認または消込済み"
            tone="green"
            icon={<CheckCircle2 size={18} />}
          />
          <SummaryCard
            label="未着金額"
            value={data ? yen(data.incoming.unconfirmed) : "..."}
            note="まだ確認していない入金"
            tone={data && data.incoming.unconfirmed > 0 ? "amber" : "green"}
            icon={<Wallet size={18} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-navy-900">入金元別の予定</h2>
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>入金元</th>
                <th className="text-right">予定額</th>
                <th className="text-right">確認済</th>
                <th className="text-right">未着金</th>
                <th className="text-right">件数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center text-navy-400 py-8">読み込み中...</td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-navy-400 py-8">この月の入金予定はありません。</td>
                </tr>
              ) : groups.map(group => (
                <tr key={group.name}>
                  <td className="primary">{group.name}</td>
                  <td className="amount">{yen(group.total)}</td>
                  <td className="amount text-emerald-700">{yen(group.confirmed)}</td>
                  <td className="amount text-gold-700">{yen(group.unconfirmed)}</td>
                  <td className="text-right tabular-nums">{group.count}件</td>
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
              <div key={group.name} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-navy-900">{group.name}</p>
                    <p className="text-[12px] text-navy-400 mt-1">{group.count}件</p>
                  </div>
                  <p className="text-[18px] font-semibold text-navy-900 tabular-nums">{yen(group.total)}</p>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>支払期限</th>
                      <th>請求書番号</th>
                      <th>件名</th>
                      <th className="text-right">金額</th>
                      <th>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <tr key={item.id}>
                        <td className="tabular-nums whitespace-nowrap">{date(item.dueDate)}</td>
                        <td className="font-mono text-[11px]">{item.invoiceNumber || "-"}</td>
                        <td className="font-medium text-navy-800">{item.subject}</td>
                        <td className="amount">{yen(item.amount)}</td>
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
