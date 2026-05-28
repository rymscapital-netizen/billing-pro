"use client"

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Calculator, CheckCircle2, RefreshCw, Save, TrendingUp, Wallet } from "lucide-react"

const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false })
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false })
const ComposedChart = dynamic(() => import("recharts").then(m => m.ComposedChart), { ssr: false })
const Legend = dynamic(() => import("recharts").then(m => m.Legend), { ssr: false })
const Line = dynamic(() => import("recharts").then(m => m.Line), { ssr: false })
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false })
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false })
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false })

type ProfitItem = {
  id: string
  invoiceNumber: string
  companyName: string
  subject: string
  issueDate: string
  dueDate: string
  paymentDate: string | null
  sales: number
  cost: number
  grossProfit: number
  commissionRate: number
  commissionAmount: number
  amount: number
  status: string
  hasProfit: boolean
}

type UserExpense = {
  id?: string | null
  userId?: string | null
  yearMonth?: string | null
  baseSalary: number
  socialInsurance: number
  employeeSocialInsurance: number
  withholdingTax: number
  rentAllocation: number
  paidCommission: number
  travelExpense: number
  corporateTax: number
  communicationCost: number
  welfareExpense: number
  suppliesExpense: number
  otherExpense: number
  otherMemo?: string | null
  totalExpense: number
  totalDeductionReference?: number
  isAutoRentAllocation?: boolean
}

type ProfitGroup = {
  userId: string
  userName: string
  sales: number
  cost: number
  grossProfit: number
  commissionRate: number
  commissionAmount: number
  amount: number
  confirmedAmount: number
  unconfirmedAmount: number
  invoiceCount: number
  missingProfitCount: number
  profitRate: number
  expenses: UserExpense
  totalExpense: number
  retainedProfit: number
  items: ProfitItem[]
}

type ProfitHistory = {
  month: string
  label: string
  sales: number
  cost: number
  grossProfit: number
  commissionAmount: number
  totalExpense: number
  retainedProfit: number
  amount: number
  confirmedAmount: number
  unconfirmedAmount: number
  invoiceCount: number
  missingProfitCount: number
  profitRate: number
}

type ProfitTotals = {
  sales: number
  cost: number
  grossProfit: number
  commissionAmount: number
  totalExpense: number
  retainedProfit: number
  amount: number
  confirmedAmount: number
  unconfirmedAmount: number
  invoiceCount: number
  missingProfitCount: number
  profitRate: number
}

type ProfitData = {
  users: { id: string; name: string; commissionRate: number }[]
  canViewAllUsers: boolean
  totals: ProfitTotals
  groups: ProfitGroup[]
  expenses: UserExpense[]
  officeRent: number
  history: ProfitHistory[]
  fiscalYear: {
    startMonth: string
    endMonth: string
  }
}

const yen = (value: number) => `¥${Math.round(Number(value ?? 0)).toLocaleString("ja-JP")}`
const yenShort = (value: number) => {
  const number = Math.round(Number(value ?? 0))
  const sign = number < 0 ? "-" : ""
  const absolute = Math.abs(number)
  if (absolute >= 100_000_000) return `${sign}¥${(absolute / 100_000_000).toFixed(1)}億`
  if (absolute >= 10_000) return `${sign}¥${Math.round(absolute / 10_000).toLocaleString("ja-JP")}万`
  return `${sign}¥${absolute.toLocaleString("ja-JP")}`
}
const pct = (value: number) => `${Number(value ?? 0).toFixed(1)}%`
const blankExpense = (userId: string, yearMonth: string): UserExpense => ({
  userId,
  yearMonth,
  baseSalary: 0,
  socialInsurance: 0,
  employeeSocialInsurance: 0,
  withholdingTax: 0,
  rentAllocation: 0,
  paidCommission: 0,
  travelExpense: 0,
  corporateTax: 0,
  communicationCost: 0,
  welfareExpense: 0,
  suppliesExpense: 0,
  otherExpense: 0,
  otherMemo: "",
  totalExpense: 0,
})
const expenseFields: { key: keyof UserExpense; label: string }[] = [
  { key: "baseSalary", label: "基本給" },
  { key: "socialInsurance", label: "社保（会社負担）" },
  { key: "rentAllocation", label: "家賃按分" },
  { key: "paidCommission", label: "支払歩合" },
  { key: "travelExpense", label: "交通費等" },
  { key: "corporateTax", label: "法人実効税額" },
  { key: "communicationCost", label: "通信費" },
  { key: "welfareExpense", label: "福利厚生" },
  { key: "suppliesExpense", label: "備品・消耗品" },
  { key: "otherExpense", label: "その他" },
]
const referenceDeductionFields: { key: keyof UserExpense; label: string }[] = [
  { key: "employeeSocialInsurance", label: "社保（本人負担）" },
  { key: "withholdingTax", label: "税控除等" },
]
const expenseTotal = (expense: UserExpense) => expenseFields.reduce((sum, field) => sum + Number(expense[field.key] ?? 0), 0)
const deductionTotal = (expense: UserExpense) => referenceDeductionFields.reduce((sum, field) => sum + Number(expense[field.key] ?? 0), 0)
const date = (value: string) => {
  const datePart = value?.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart.replace(/-/g, "/").replace(/\/0/g, "/")
  }
  return new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
}
const currentMonth = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
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

function InvoiceTable({
  groups,
  dateLabel,
  emptyText,
}: {
  groups: ProfitGroup[]
  dateLabel: string
  emptyText: string
}) {
  if (groups.length === 0) {
    return <div className="card p-8 text-center text-[13px] text-navy-400">{emptyText}</div>
  }

  return (
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
                <th>{dateLabel}</th>
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
                  <td className="tabular-nums whitespace-nowrap">{item.paymentDate ? date(item.paymentDate) : "-"}</td>
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
  )
}

export default function AdminProfitsPage() {
  const [yearMonth, setYearMonth] = useState(currentMonth)
  const [assignedUserId, setAssignedUserId] = useState("")
  const [users, setUsers] = useState<{ id: string; name: string; commissionRate: number }[]>([])
  const [data, setData] = useState<ProfitData | null>(null)
  const [expenseForms, setExpenseForms] = useState<Record<string, UserExpense>>({})
  const [savingExpenseId, setSavingExpenseId] = useState("")
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)

  const showToast = (message: string, ok = true) => {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ yearMonth })
      if (assignedUserId) params.set("assignedUserId", assignedUserId)
      const res = await fetch(`/api/profit-by-user?${params.toString()}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "担当者別利益の取得に失敗しました")
      setData(body)
      setUsers(body?.users ?? [])
      const nextForms: Record<string, UserExpense> = {}
      for (const user of body?.users ?? []) {
        nextForms[user.id] = blankExpense(user.id, yearMonth)
      }
      for (const expense of body?.expenses ?? []) {
        nextForms[expense.userId] = { ...blankExpense(expense.userId, yearMonth), ...expense }
      }
      setExpenseForms(nextForms)
    } catch (error: any) {
      showToast(error?.message ?? "担当者別利益の取得に失敗しました", false)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [yearMonth, assignedUserId])

  const updateExpenseField = (userId: string, field: keyof UserExpense, value: string) => {
    setExpenseForms(prev => {
      const current = prev[userId] ?? blankExpense(userId, yearMonth)
      const next = {
        ...current,
        [field]: field === "otherMemo" ? value : Math.max(0, Number(value) || 0),
      } as UserExpense
      next.totalExpense = expenseTotal(next)
      return { ...prev, [userId]: next }
    })
  }

  const saveExpense = async (userId: string) => {
    const form = expenseForms[userId] ?? blankExpense(userId, yearMonth)
    setSavingExpenseId(userId)
    try {
      const res = await fetch("/api/user-monthly-expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, userId, yearMonth }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "月次経費の保存に失敗しました")
      showToast("月次経費を保存しました")
      await fetchData()
    } catch (error: any) {
      showToast(error?.message ?? "月次経費の保存に失敗しました", false)
    } finally {
      setSavingExpenseId("")
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const groups = useMemo(() => data?.groups ?? [], [data])
  const canViewAllUsers = data?.canViewAllUsers ?? true
  const currentUserName = users[0]?.name ?? ""
  const chartData = useMemo(() => (data?.history ?? []).map(row => ({
    month: row.label,
    sales: row.sales,
    grossProfit: row.grossProfit,
    commission: row.commissionAmount,
    retainedProfit: row.retainedProfit,
  })), [data])
  const hasHistory = chartData.some(row => row.sales !== 0 || row.grossProfit !== 0 || row.commission !== 0 || row.retainedProfit !== 0)

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
            入金期限ベースで、担当者ごとの売上・原価・粗利・概算歩合を確認できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={event => setYearMonth(event.target.value)}
            className="form-input w-[150px]"
          />
          {canViewAllUsers ? (
          <select
            value={assignedUserId}
            onChange={event => setAssignedUserId(event.target.value)}
            className="form-input w-[150px]"
          >
            <option value="">担当者: 全員</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
          ) : (
            <div className="form-input w-[150px] bg-navy-50 text-navy-600 flex items-center">
              {currentUserName || "自分の担当分"}
            </div>
          )}
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
            value={data ? yen(data.totals.commissionAmount) : "..."}
            note="担当者ごとの固定歩合率で計算"
            tone="amber"
            icon={<Calculator size={18} />}
          />
          <SummaryCard
            label="会社に残る利益"
            value={data ? yen(data.totals.retainedProfit) : "..."}
            note={data ? `月次経費 ${yen(data.totals.totalExpense)}` : undefined}
            tone={data && data.totals.retainedProfit >= 0 ? "green" : "amber"}
            icon={<TrendingUp size={18} />}
          />
          <SummaryCard
            label="着金済"
            value={data ? yen(data.totals.confirmedAmount) : "..."}
            note={data ? `未着金 ${yen(data.totals.unconfirmedAmount)}` : undefined}
            tone="green"
            icon={<CheckCircle2 size={18} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-navy-900">過去12か月の成績</h2>
            <p className="text-[12px] text-navy-400 mt-1">
              決算期（6月〜5月）ごとに、売上・粗利・概算歩合の推移を確認できます。
            </p>
          </div>
          <p className="text-[12px] text-navy-400">
            {data ? `${data.fiscalYear.startMonth}〜${data.fiscalYear.endMonth}` : ""}
            {assignedUserId ? " / 選択中の担当者のみ" : " / 全担当者"}
          </p>
        </div>
        <div className="card p-4">
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-[13px] text-navy-400">読み込み中...</div>
          ) : hasHistory ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 18, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4eaf4" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#58709d" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yenShort} tick={{ fontSize: 11, fill: "#58709d" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  formatter={(value: number, name: string) => [yen(value), name]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #dbe4f3" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                <Bar dataKey="sales" name="売上" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="grossProfit" name="粗利" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line dataKey="commission" name="概算歩合" type="monotone" stroke="#c49828" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line dataKey="retainedProfit" name="会社に残る利益" type="monotone" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-[13px] text-navy-400">過去12か月の成績データはありません。</div>
          )}
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
                <th style={{ textAlign: "right" }}>歩合率</th>
                <th style={{ textAlign: "right" }}>概算歩合</th>
                <th style={{ textAlign: "right" }}>月次経費</th>
                <th style={{ textAlign: "right" }}>会社に残る利益</th>
                <th style={{ textAlign: "right" }}>件数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center text-navy-400 py-8">読み込み中...</td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-navy-400 py-8">この月の利益データはありません。</td>
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
                  <td className="amount">{pct(group.commissionRate)}</td>
                  <td className="amount text-gold-700">{yen(group.commissionAmount)}</td>
                  <td className="amount text-red-700">{yen(group.totalExpense)}</td>
                  <td className={`amount ${group.retainedProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{yen(group.retainedProfit)}</td>
                  <td className="text-right tabular-nums">{group.invoiceCount}件</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-navy-900">月次経費</h2>
            <p className="text-[12px] text-navy-400 mt-1">
              担当者ごとに、その月の人件費・共通費・税額を保存できます。
            </p>
          </div>
          <p className="text-[12px] text-navy-400">{yearMonth}</p>
        </div>
        {data && data.officeRent > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
            事務所家賃 {yen(data.officeRent)} は、各月の在籍スタッフへ自動で按分しています。入社日は設定ページの登録ユーザー一覧から変更できます。
          </div>
        )}
        <div className="space-y-3">
          {users.map(user => {
            const form = expenseForms[user.id] ?? blankExpense(user.id, yearMonth)
            return (
              <div key={user.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-navy-900">{user.name}</p>
                    <p className="text-[12px] text-navy-400">
                      会社コスト {yen(expenseTotal(form))} / 本人控除メモ {yen(deductionTotal(form))}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-navy"
                    onClick={() => saveExpense(user.id)}
                    disabled={savingExpenseId === user.id}
                  >
                    <Save size={13} />
                    {savingExpenseId === user.id ? "保存中..." : "保存"}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {expenseFields.map(field => (
                    <label key={field.key} className="block">
                      <span className="block text-[11px] text-navy-400 mb-1">{field.label}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={Number(form[field.key] ?? 0)}
                        onChange={event => updateExpenseField(user.id, field.key, event.target.value)}
                        readOnly={field.key === "rentAllocation" && (data?.officeRent ?? 0) > 0}
                        className={`form-input text-right tabular-nums ${
                          field.key === "rentAllocation" && (data?.officeRent ?? 0) > 0 ? "bg-navy-50 text-navy-500" : ""
                        }`}
                      />
                      {field.key === "rentAllocation" && (data?.officeRent ?? 0) > 0 && (
                        <span className="block text-[10.5px] text-navy-400 mt-1">自動按分</span>
                      )}
                    </label>
                  ))}
                </div>
                <div className="rounded-lg border border-navy-100 bg-navy-50 p-3">
                  <p className="text-[11px] font-medium text-navy-500 mb-2">
                    本人負担・控除メモ（会社に残る利益の計算には含めません）
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {referenceDeductionFields.map(field => (
                      <label key={field.key} className="block">
                        <span className="block text-[11px] text-navy-400 mb-1">{field.label}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Number(form[field.key] ?? 0)}
                          onChange={event => updateExpenseField(user.id, field.key, event.target.value)}
                          className="form-input text-right tabular-nums bg-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="block text-[11px] text-navy-400 mb-1">その他メモ</span>
                  <input
                    type="text"
                    value={form.otherMemo ?? ""}
                    onChange={event => updateExpenseField(user.id, "otherMemo", event.target.value)}
                    className="form-input"
                    placeholder="その他経費の内訳など"
                  />
                </label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-navy-900">請求書明細</h2>
        <InvoiceTable
          groups={groups}
          dateLabel="入金期限"
          emptyText="この月に入金期限を迎える請求書はありません。"
        />
      </section>
    </div>
  )
}
