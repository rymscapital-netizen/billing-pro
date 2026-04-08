"use client"

import React, { useEffect, useState } from "react"
import dynamic from "next/dynamic"

// recharts は CSR のみ（SSR無効）
const BarChart        = dynamic(() => import("recharts").then(m => m.BarChart),        { ssr: false })
const Bar             = dynamic(() => import("recharts").then(m => m.Bar),             { ssr: false })
const XAxis           = dynamic(() => import("recharts").then(m => m.XAxis),           { ssr: false })
const YAxis           = dynamic(() => import("recharts").then(m => m.YAxis),           { ssr: false })
const CartesianGrid   = dynamic(() => import("recharts").then(m => m.CartesianGrid),   { ssr: false })
const Tooltip         = dynamic(() => import("recharts").then(m => m.Tooltip),         { ssr: false })
const Legend          = dynamic(() => import("recharts").then(m => m.Legend),          { ssr: false })
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false })

const yen = (n: number) => `¥${Number(n).toLocaleString("ja-JP")}`
const yenShort = (n: number) => {
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `¥${(n / 10_000).toFixed(0)}万`
  return `¥${n.toLocaleString("ja-JP")}`
}

const MONTH_LABELS = ["前月実績", "今月実績", "来月予想"]

const toYearMonthValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

const defaultStartMonth = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 11) // 11ヶ月前〜今月（12ヶ月・issueDate基準）
  return toYearMonthValue(d)
}

export default function AdminDashboardPage() {
  const [data, setData]             = useState<any>(null)
  const [mounted, setMounted]       = useState(false)
  const [allUsers, setAllUsers]     = useState<{ id: string; name: string }[]>([])
  const [filterUserId, setFilterUserId] = useState("")
  const [startMonth, setStartMonth] = useState(defaultStartMonth)

  useEffect(() => {
    fetch("/api/users")
      .then(r => r.ok ? r.json() : [])
      .then((users: any[]) => setAllUsers(users.filter((u: any) => u.role === "ADMIN").map((u: any) => ({ id: u.id, name: u.name }))))
  }, [])

  useEffect(() => {
    setMounted(true)
    const p = new URLSearchParams()
    if (filterUserId) p.set("assignedUserId", filterUserId)
    if (startMonth)   p.set("startMonth", startMonth)
    fetch(`/api/dashboard?${p.toString()}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(err => console.error("dashboard fetch error:", err))
  }, [filterUserId, startMonth])

  const salesCards = [
    { label: "今月売上総額", value: data ? yen(data.thisMonthDue)       : "…", color: "#c49828" },
    { label: "今月入金済額", value: data ? yen(data.thisMonthPaid)      : "…", color: "#2e9e62" },
    { label: "今月未回収額", value: data ? yen(data.thisMonthRemaining) : "…", color: "#c43030" },
  ]

  const payableCards = [
    { label: "被請求書合計",   value: data ? yen(data.payableTotal     ?? 0) : "…", color: "#c49828" },
    { label: "支払済み合計",   value: data ? yen(data.payablePaid      ?? 0) : "…", color: "#2e9e62" },
    { label: "未払い残額",     value: data ? yen(data.payableRemaining ?? 0) : "…", color: "#c43030" },
  ]

  const pl = data?.monthlyPL

  // PLテーブル: 項目ごとに 税込/税抜/消費税額 の3行を表示
  type PlSection = {
    label: string
    color: string
    isBold?: boolean
    rows: { sub: string; prev: number; current: number; next: number }[]
  }
  const plSections: PlSection[] = pl
    ? [
        {
          label: "売上", color: "#0f1f3d",
          rows: [
            { sub: "税込",    prev: pl.prev.salesInc, current: pl.current.salesInc, next: pl.next.salesInc },
            { sub: "税抜",    prev: pl.prev.salesEx,  current: pl.current.salesEx,  next: pl.next.salesEx  },
            { sub: "消費税額", prev: pl.prev.salesTax, current: pl.current.salesTax, next: pl.next.salesTax },
          ],
        },
        {
          label: "原価", color: "#c43030",
          rows: [
            { sub: "税込",    prev: pl.prev.costInc,  current: pl.current.costInc,  next: pl.next.costInc  },
            { sub: "税抜",    prev: pl.prev.costEx,   current: pl.current.costEx,   next: pl.next.costEx   },
            { sub: "消費税額", prev: pl.prev.costTax,  current: pl.current.costTax,  next: pl.next.costTax  },
          ],
        },
        {
          label: "粗利", color: "#2e9e62", isBold: true,
          rows: [
            { sub: "税込",    prev: pl.prev.profitInc,  current: pl.current.profitInc,  next: pl.next.profitInc  },
            { sub: "税抜",    prev: pl.prev.profitEx,   current: pl.current.profitEx,   next: pl.next.profitEx   },
            { sub: "消費税額", prev: pl.prev.profitTax,  current: pl.current.profitTax,  next: pl.next.profitTax  },
          ],
        },
        {
          label: "経費（被請求）", color: "#7c3aed",
          rows: [
            { sub: "合計", prev: pl.prev.expenseTotal, current: pl.current.expenseTotal, next: pl.next.expenseTotal },
          ],
        },
        {
          label: "収支（売上－経費）", color: "#0f1f3d", isBold: true,
          rows: [
            { sub: "合計", prev: pl.prev.balance, current: pl.current.balance, next: pl.next.balance },
          ],
        },
      ]
    : []

  const chartData = (data?.monthlyTrend ?? []).map((m: any) => ({
    name:         m.month,
    "売上(税込)":    m.salesInc,
    "経費（被請求）": m.expenseTotal,
    "収支":          m.balance,
  }))

  return (
    <div style={{ padding: "40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "600", color: "#0f1f3d" }}>
          ダッシュボード
        </h1>
        {/* 担当者フィルター */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.06em" }}>表示対象</span>
          <select
            value={filterUserId}
            onChange={e => setFilterUserId(e.target.value)}
            style={{
              padding: "6px 10px", fontSize: "12px", border: "1px solid #e4eaf4",
              borderRadius: "8px", color: "#0f1f3d", background: "#fff",
              outline: "none", cursor: "pointer",
            }}
          >
            <option value="">全員（法人全体）</option>
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ color: "#8a9ab8", fontSize: "14px" }}>
        {filterUserId
          ? `担当者：${allUsers.find(u => u.id === filterUserId)?.name ?? ""} のデータを表示中`
          : "ようこそ！BillingPro 管理画面へ"}
      </p>

      {/* 売上サマリー */}
      <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "32px", marginBottom: "10px" }}>
        売上サマリー（今月）
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {salesCards.map((card) => (
          <div key={card.label} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "20px" }}>
            <p style={{ fontSize: "11px", color: "#8a9ab8", marginBottom: "8px", textTransform: "uppercase" }}>{card.label}</p>
            <p style={{ fontSize: "24px", fontWeight: "600", color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* セットアップ完了 */}
      <div style={{ marginTop: "24px", background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "20px" }}>
        <p style={{ color: "#0f1f3d", fontWeight: "500", marginBottom: "8px" }}>セットアップ完了！</p>
        <p style={{ color: "#8a9ab8", fontSize: "13px", lineHeight: "1.6" }}>
          BillingProが正常に起動しています。<br />
          左のメニューから各機能をご利用ください。
        </p>
      </div>

      {/* 請求される項目 */}
      <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "32px", marginBottom: "10px" }}>
        被請求書サマリー（全期間）
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        {payableCards.map((card) => (
          <div key={card.label} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "20px" }}>
            <p style={{ fontSize: "11px", color: "#8a9ab8", marginBottom: "8px", textTransform: "uppercase" }}>{card.label}</p>
            <p style={{ fontSize: "24px", fontWeight: "600", color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* 月次 PL テーブル */}
      <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "32px", marginBottom: "10px" }}>
        月次 損益サマリー
      </p>
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f7f9fc" }}>
              <th style={{ padding: "10px 20px", textAlign: "left", color: "#8a9ab8", fontSize: "11px", fontWeight: "500", textTransform: "uppercase", borderBottom: "1px solid #e4eaf4" }}>
                項目
              </th>
              {MONTH_LABELS.map(label => (
                <th key={label} style={{ padding: "10px 20px", textAlign: "right", color: "#8a9ab8", fontSize: "11px", fontWeight: "500", textTransform: "uppercase", borderBottom: "1px solid #e4eaf4" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plSections.map((section, si) => (
              <React.Fragment key={section.label}>
                {/* セクションヘッダー行 */}
                <tr style={{ background: "#f7f9fc", borderTop: si > 0 ? "2px solid #e4eaf4" : "none" }}>
                  <td colSpan={4} style={{ padding: "6px 20px", fontSize: "11px", fontWeight: "600", color: section.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {section.label}
                  </td>
                </tr>
                {/* 税込/税抜/消費税額 の3行 */}
                {section.rows.map((row) => (
                  <tr key={`${section.label}-${row.sub}`} style={{ borderBottom: "1px solid #f0f4fa", background: section.isBold ? "#f7fdf9" : "#fff" }}>
                    <td style={{ padding: "8px 20px 8px 32px", color: "#8a9ab8", fontSize: "12px" }}>
                      {row.sub}
                    </td>
                    {(["prev", "current", "next"] as const).map(period => (
                      <td key={period} style={{
                        padding: "8px 20px",
                        textAlign: "right",
                        fontWeight: section.isBold && row.sub === "税抜" ? "600" : "400",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: "12px",
                        color: section.isBold
                          ? (row[period] >= 0 ? "#2e9e62" : "#c43030")
                          : section.label === "原価" ? "#c43030"
                          : section.label === "経費（被請求）" ? "#7c3aed"
                          : "#0f1f3d",
                      }}>
                        {data ? yen(row[period]) : "…"}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* グラフ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "32px", marginBottom: "10px" }}>
        <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
          月次推移グラフ（12ヶ月・支払期日基準）
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#8a9ab8" }}>開始月</span>
          <input
            type="month"
            value={startMonth}
            onChange={e => setStartMonth(e.target.value)}
            style={{
              padding: "4px 8px", fontSize: "12px", border: "1px solid #e4eaf4",
              borderRadius: "6px", color: "#0f1f3d", background: "#fff", outline: "none",
            }}
          />
          <button
            onClick={() => setStartMonth(defaultStartMonth())}
            style={{
              padding: "4px 10px", fontSize: "11px", border: "1px solid #e4eaf4",
              borderRadius: "6px", color: "#8a9ab8", background: "#fff", cursor: "pointer",
            }}
          >
            リセット
          </button>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "24px" }}>
        {!mounted || !data ? (
          <div style={{ textAlign: "center", color: "#8a9ab8", padding: "40px 0", fontSize: "13px" }}>読み込み中…</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 24, left: 16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4eaf4" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#8a9ab8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={yenShort} tick={{ fontSize: 11, fill: "#8a9ab8" }} axisLine={false} tickLine={false} width={72} />
              <Tooltip
                formatter={(value: number, name: string) => [yen(value), name]}
                contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e4eaf4" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} />
              <Bar dataKey="売上(税込)" fill="#4e7cff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="経費（被請求）" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="収支" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
