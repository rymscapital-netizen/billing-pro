"use client"

import { useState, useEffect, useCallback } from "react"
import { Link2, Check, X, Trash2, Clock, CheckCircle2, Users, AlertCircle } from "lucide-react"

interface Connection {
  id: string
  companyAId: string
  companyBId: string
  status: "PENDING" | "APPROVED"
  requestedByCompanyId: string
  createdAt: string
  updatedAt: string
  otherCompanyId: string
  otherCompanyName: string
  isRequester: boolean
}

interface LookupResult {
  companyId: string
  companyName: string
}

const date = (d: string) => new Date(d).toLocaleDateString("ja-JP")

export function ConnectionsPage() {
  const [connections, setConnections]     = useState<Connection[]>([])
  const [loading, setLoading]             = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage]             = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // 申請フォーム
  const [companyName, setCompanyName] = useState("")
  const [email, setEmail]             = useState("")
  const [lookupResult, setLookupResult]   = useState<LookupResult | null>(null)
  const [lookupError, setLookupError]     = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)

  const showMsg = (type: "ok" | "err", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const fetchConnections = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/connections")
    if (res.ok) setConnections(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchConnections() }, [fetchConnections])

  // フォームが変更されたらlookup結果をリセット
  const handleCompanyNameChange = (v: string) => {
    setCompanyName(v)
    setLookupResult(null)
    setLookupError("")
  }
  const handleEmailChange = (v: string) => {
    setEmail(v)
    setLookupResult(null)
    setLookupError("")
  }

  // 絞り込み検索（送信後のみ実行）
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName.trim() || !email.trim()) return
    setLookupResult(null)
    setLookupError("")
    setLookupLoading(true)
    const res = await fetch("/api/connections/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: companyName.trim(), email: email.trim() }),
    })
    const d = await res.json()
    setLookupLoading(false)
    if (!res.ok) {
      setLookupError(d.error ?? "検索に失敗しました")
      return
    }
    setLookupResult(d)
  }

  // 申請送信
  const handleRequest = async () => {
    if (!lookupResult) return
    setRequestLoading(true)
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCompanyId: lookupResult.companyId }),
    })
    const d = await res.json()
    setRequestLoading(false)
    if (!res.ok) { showMsg("err", d.error ?? "申請に失敗しました"); return }
    showMsg("ok", `${lookupResult.companyName} に紐づけを申請しました`)
    setCompanyName("")
    setEmail("")
    setLookupResult(null)
    setLookupError("")
    fetchConnections()
  }

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(id)
    const res = await fetch(`/api/connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const d = await res.json()
    setActionLoading(null)
    if (!res.ok) { showMsg("err", d.error ?? "操作に失敗しました"); return }
    showMsg("ok", action === "approve" ? "承認しました" : "拒否しました")
    fetchConnections()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」との紐づけを解除しますか？`)) return
    setActionLoading(id)
    const res = await fetch(`/api/connections/${id}`, { method: "DELETE" })
    setActionLoading(null)
    if (!res.ok) { showMsg("err", "解除に失敗しました"); return }
    showMsg("ok", "紐づけを解除しました")
    fetchConnections()
  }

  const received = connections.filter(c => c.status === "PENDING" && !c.isRequester)
  const sent     = connections.filter(c => c.status === "PENDING" && c.isRequester)
  const approved = connections.filter(c => c.status === "APPROVED")

  const connectedIds = new Set(connections.map(c => c.otherCompanyId))
  const alreadyConnected = lookupResult ? connectedIds.has(lookupResult.companyId) : false

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 11px",
    border: "1px solid #c0cee4", borderRadius: "8px",
    fontSize: "13px", boxSizing: "border-box", outline: "none",
  }
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "11px", color: "#8a9ab8",
    marginBottom: "4px", textTransform: "uppercase" as const, letterSpacing: "0.06em",
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#0f1f3d", marginBottom: "4px" }}>
          取引先連携
        </h2>
        <p style={{ fontSize: "12px", color: "#8a9ab8" }}>
          会社間でデータを同期するための紐づけを管理します
        </p>
      </div>

      {message && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          fontSize: "13px",
          background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${message.type === "ok" ? "#86efac" : "#fca5a5"}`,
          color: message.type === "ok" ? "#15803d" : "#b91c1c",
        }}>
          {message.type === "ok" ? <CheckCircle2 size={14} /> : <X size={14} />}
          {message.text}
        </div>
      )}

      {/* ── 申請フォーム ── */}
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "20px", marginBottom: "20px" }}>
        <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
          紐づけ申請
        </p>
        <p style={{ fontSize: "12px", color: "#4e6a9c", marginBottom: "16px", lineHeight: "1.6" }}>
          相手会社の <strong>会社名</strong>（完全一致）と、その会社に登録されている <strong>メールアドレス</strong> を入力して検索してください。
          一致した場合のみ申請できます。
        </p>

        <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={lbl}>会社名 <span style={{ color: "#c43030" }}>*</span></label>
            <input
              type="text"
              value={companyName}
              onChange={e => handleCompanyNameChange(e.target.value)}
              placeholder="株式会社〇〇（正確な会社名を入力）"
              required
              style={inp}
            />
          </div>
          <div>
            <label style={lbl}>担当者のメールアドレス <span style={{ color: "#c43030" }}>*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => handleEmailChange(e.target.value)}
              placeholder="担当者のメールアドレス"
              required
              style={inp}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={lookupLoading || !companyName.trim() || !email.trim()}
              style={{
                padding: "8px 20px", fontSize: "12px", fontWeight: "500",
                background: "#0f1f3d", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer",
                opacity: (lookupLoading || !companyName.trim() || !email.trim()) ? 0.5 : 1,
              }}
            >
              {lookupLoading ? "検索中..." : "検索する"}
            </button>
          </div>
        </form>

        {/* 検索エラー */}
        {lookupError && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
            background: "#fef2f2", border: "1px solid #fca5a5",
            fontSize: "12px", color: "#b91c1c",
          }}>
            <AlertCircle size={13} />
            {lookupError}
          </div>
        )}

        {/* 検索ヒット */}
        {lookupResult && (
          <div style={{
            marginTop: "12px", padding: "14px 16px", borderRadius: "8px",
            border: `1px solid ${alreadyConnected ? "#c0cee4" : "#86efac"}`,
            background: alreadyConnected ? "#f7f9fc" : "#f0fdf4",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: "13px", fontWeight: "600", color: "#0f1f3d", marginBottom: "2px" }}>
                  {lookupResult.companyName}
                </p>
                <p style={{ fontSize: "11px", color: "#8a9ab8" }}>会社名とメールアドレスが一致しました</p>
              </div>
              {alreadyConnected ? (
                <span style={{
                  fontSize: "11px", color: "#8a9ab8",
                  background: "#e4eaf4", borderRadius: "999px",
                  padding: "3px 10px", fontWeight: "500",
                }}>
                  申請済み / 紐づけ済み
                </span>
              ) : (
                <button
                  onClick={handleRequest}
                  disabled={requestLoading}
                  style={{
                    padding: "7px 16px", fontSize: "12px", fontWeight: "600",
                    background: "#0f1f3d", color: "#fff",
                    border: "none", borderRadius: "8px", cursor: "pointer",
                    opacity: requestLoading ? 0.6 : 1,
                  }}
                >
                  {requestLoading ? "申請中..." : "紐づけを申請する"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#8a9ab8", fontSize: "13px" }}>読み込み中...</div>
      ) : (
        <>
          {/* ── 受け取った申請 ── */}
          <Section
            icon={<Clock size={13} />}
            title="受け取った申請"
            count={received.length}
            color="#c49828"
            empty="受け取った申請はありません"
          >
            {received.map(c => (
              <ConnectionRow key={c.id} name={c.otherCompanyName} date={c.createdAt}>
                <span style={{ fontSize: "11px", color: "#c49828", background: "#fefce8", border: "1px solid #fde68a", borderRadius: "999px", padding: "2px 10px", fontWeight: "500" }}>
                  承認待ち
                </span>
                <button
                  onClick={() => handleAction(c.id, "approve")}
                  disabled={!!actionLoading}
                  style={btnStyle("#2e9e62")}
                >
                  <Check size={12} /> 承認
                </button>
                <button
                  onClick={() => handleAction(c.id, "reject")}
                  disabled={!!actionLoading}
                  style={btnStyle("#c43030")}
                >
                  <X size={12} /> 拒否
                </button>
              </ConnectionRow>
            ))}
          </Section>

          {/* ── 送った申請 ── */}
          <Section
            icon={<Link2 size={13} />}
            title="送った申請"
            count={sent.length}
            color="#4e6a9c"
            empty="送った申請はありません"
          >
            {sent.map(c => (
              <ConnectionRow key={c.id} name={c.otherCompanyName} date={c.createdAt}>
                <span style={{ fontSize: "11px", color: "#4e6a9c", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "999px", padding: "2px 10px", fontWeight: "500" }}>
                  承認待ち
                </span>
                <button
                  onClick={() => handleDelete(c.id, c.otherCompanyName)}
                  disabled={!!actionLoading}
                  style={btnStyle("#8a9ab8", true)}
                >
                  <Trash2 size={12} /> 取り消し
                </button>
              </ConnectionRow>
            ))}
          </Section>

          {/* ── 紐づけ済み ── */}
          <Section
            icon={<Users size={13} />}
            title="紐づけ済み"
            count={approved.length}
            color="#2e9e62"
            empty="紐づけ済みの会社はありません"
          >
            {approved.map(c => (
              <ConnectionRow key={c.id} name={c.otherCompanyName} date={c.updatedAt} dateLabel="紐づけ日">
                <span style={{ fontSize: "11px", color: "#15803d", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "999px", padding: "2px 10px", fontWeight: "500" }}>
                  連携中
                </span>
                <button
                  onClick={() => handleDelete(c.id, c.otherCompanyName)}
                  disabled={!!actionLoading}
                  style={btnStyle("#c43030", true)}
                >
                  <Trash2 size={12} /> 解除
                </button>
              </ConnectionRow>
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({
  icon, title, count, color, children, empty,
}: {
  icon: React.ReactNode
  title: string
  count: number
  color: string
  children: React.ReactNode
  empty: string
}) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", overflow: "hidden", marginBottom: "16px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "12px 20px", borderBottom: "1px solid #e4eaf4",
        background: "#f7f9fc",
      }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: "12px", fontWeight: "600", color: "#0f1f3d" }}>{title}</span>
        <span style={{
          fontSize: "11px", fontWeight: "600", color,
          background: `${color}18`, borderRadius: "999px",
          padding: "1px 8px", marginLeft: "2px",
        }}>
          {count}件
        </span>
      </div>
      {count === 0 ? (
        <div style={{ padding: "24px 20px", color: "#8a9ab8", fontSize: "12px", textAlign: "center" }}>
          {empty}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  )
}

function ConnectionRow({
  name, date: d, dateLabel = "申請日", children,
}: {
  name: string
  date: string
  dateLabel?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px", borderBottom: "1px solid #f0f4fa",
    }}>
      <div>
        <p style={{ fontSize: "13px", fontWeight: "600", color: "#0f1f3d", marginBottom: "2px" }}>{name}</p>
        <p style={{ fontSize: "11px", color: "#8a9ab8" }}>{dateLabel}: {date(d)}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {children}
      </div>
    </div>
  )
}

function btnStyle(color: string, outline = false): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: "4px",
    padding: "5px 10px", fontSize: "11px", fontWeight: "500",
    background: outline ? "#fff" : color,
    color: outline ? color : "#fff",
    border: `1px solid ${color}`,
    borderRadius: "6px", cursor: "pointer",
  }
}
