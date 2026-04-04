"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, Check, Plus, Clock, CheckCircle2, XCircle, RefreshCw, Building2 } from "lucide-react"

interface Invite {
  id: string
  token: string
  expiresAt: string
  createdAt: string
  usedAt: string | null
  companyName: string
  contactName: string
  status: "active" | "used" | "expired"
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })

const STATUS: Record<Invite["status"], { label: string; bg: string; color: string; border: string }> = {
  active:  { label: "有効",     bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
  used:    { label: "使用済み", bg: "#f7f9fc", color: "#4e6a9c", border: "#c0cee4" },
  expired: { label: "期限切れ", bg: "#fef2f2", color: "#b91c1c", border: "#fca5a5" },
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  border: "1px solid #c0cee4", borderRadius: "8px",
  fontSize: "13px", boxSizing: "border-box", outline: "none",
}
const lbl: React.CSSProperties = {
  display: "block", fontSize: "11px", color: "#8a9ab8",
  marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em",
}

export function InvitesPage() {
  const [invites, setInvites]       = useState<Invite[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId]     = useState<string | null>(null)
  const [newUrl, setNewUrl]         = useState<string | null>(null)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [message, setMessage]       = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [errors, setErrors]         = useState<Record<string, string>>({})

  // フォーム
  const [form, setForm] = useState({
    companyName: "", address: "", contactName: "",
    corporateNumber: "", email: "", tel: "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErrors(ev => { const n = { ...ev }; delete n[k]; return n })
    setNewUrl(null)
  }

  const showMsg = (type: "ok" | "err", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const fetchInvites = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/invites")
    if (res.ok) setInvites(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchInvites() }, [fetchInvites])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.companyName.trim())     errs.companyName = "法人名を入力してください"
    if (!form.address.trim())         errs.address = "住所を入力してください"
    if (!form.contactName.trim())     errs.contactName = "担当者名を入力してください"
    const cn = form.corporateNumber.trim()
    if (!cn) {
      errs.corporateNumber = "法人番号またはインボイス番号を入力してください"
    } else if (!/^\d{13}$/.test(cn) && !/^T\d{13}$/i.test(cn)) {
      errs.corporateNumber = "法人番号は半角数字13桁、インボイス番号は「T」+半角数字13桁で入力してください"
    }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      errs.email = "正しいメールアドレスを入力してください"
    if (!form.tel.trim())             errs.tel = "電話番号を入力してください"
    return errs
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setGenerating(true)
    setNewUrl(null)
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName:     form.companyName.trim(),
        address:         form.address.trim(),
        contactName:     form.contactName.trim(),
        corporateNumber: form.corporateNumber.trim(),
        email:           form.email.trim(),
        tel:             form.tel.trim(),
      }),
    })
    const d = await res.json()
    setGenerating(false)
    if (!res.ok) { showMsg("err", d.error ?? "生成に失敗しました"); return }

    const url = `${window.location.origin}/register?invite=${d.token}`
    setNewUrl(url)
    setNewCompanyName(d.companyName)
    showMsg("ok", `${d.companyName} への招待URLを生成しました（有効期限：7日間）`)
    setForm({ companyName: "", address: "", contactName: "", corporateNumber: "", email: "", tel: "" })
    fetchInvites()
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const activeInvites  = invites.filter(i => i.status === "active")
  const usedInvites    = invites.filter(i => i.status === "used")
  const expiredInvites = invites.filter(i => i.status === "expired")

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#0f1f3d", marginBottom: "4px" }}>
          取引先招待
        </h2>
        <p style={{ fontSize: "12px", color: "#8a9ab8", lineHeight: "1.7" }}>
          まだシステムをご利用でない取引先を招待します。取引先の情報を登録すると招待URLが発行されます。<br />
          URLを受け取った担当者はパスワードを設定するだけで、すぐにログインできます。
        </p>
      </div>

      {message && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px",
          background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${message.type === "ok" ? "#86efac" : "#fca5a5"}`,
          color: message.type === "ok" ? "#15803d" : "#b91c1c",
        }}>
          {message.type === "ok" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {message.text}
        </div>
      )}

      {/* ── 招待フォーム ── */}
      <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "24px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <Building2 size={14} style={{ color: "#8a9ab8" }} />
          <p style={{ fontSize: "12px", fontWeight: "600", color: "#0f1f3d" }}>取引先情報を入力</p>
          <span style={{ fontSize: "11px", color: "#c43030", marginLeft: "4px" }}>※ すべて必須</span>
        </div>

        <form onSubmit={handleGenerate}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>法人名</label>
              <input type="text" value={form.companyName} onChange={set("companyName")}
                placeholder="株式会社〇〇" style={{ ...inp, borderColor: errors.companyName ? "#fca5a5" : "#c0cee4" }} />
              {errors.companyName && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.companyName}</p>}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>住所</label>
              <input type="text" value={form.address} onChange={set("address")}
                placeholder="東京都〇〇区〇〇 1-2-3" style={{ ...inp, borderColor: errors.address ? "#fca5a5" : "#c0cee4" }} />
              {errors.address && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.address}</p>}
            </div>

            <div>
              <label style={lbl}>担当者名</label>
              <input type="text" value={form.contactName} onChange={set("contactName")}
                placeholder="山田 太郎" style={{ ...inp, borderColor: errors.contactName ? "#fca5a5" : "#c0cee4" }} />
              {errors.contactName && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.contactName}</p>}
            </div>

            <div>
              <label style={lbl}>法人番号 / インボイス番号</label>
              <input type="text" value={form.corporateNumber} onChange={set("corporateNumber")}
                placeholder="1234567890123 または T1234567890123" maxLength={14}
                style={{ ...inp, fontFamily: "monospace", borderColor: errors.corporateNumber ? "#fca5a5" : "#c0cee4" }} />
              <p style={{ fontSize: "10.5px", color: "#8a9ab8", marginTop: "3px" }}>
                法人：半角数字13桁 ／ 個人事業主：「T」+半角数字13桁
              </p>
              {errors.corporateNumber && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.corporateNumber}</p>}
            </div>

            <div>
              <label style={lbl}>メールアドレス</label>
              <input type="email" value={form.email} onChange={set("email")}
                placeholder="contact@example.com" style={{ ...inp, borderColor: errors.email ? "#fca5a5" : "#c0cee4" }} />
              {errors.email && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.email}</p>}
            </div>

            <div>
              <label style={lbl}>電話番号</label>
              <input type="tel" value={form.tel} onChange={set("tel")}
                placeholder="03-0000-0000" style={{ ...inp, borderColor: errors.tel ? "#fca5a5" : "#c0cee4" }} />
              {errors.tel && <p style={{ fontSize: "11px", color: "#c43030", marginTop: "3px" }}>{errors.tel}</p>}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "12px", borderTop: "1px solid #f0f4fa" }}>
            <button
              type="submit"
              disabled={generating}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 24px", fontSize: "13px", fontWeight: "600",
                background: generating ? "#8a9ab8" : "#0f1f3d", color: "#fff",
                border: "none", borderRadius: "8px",
                cursor: generating ? "not-allowed" : "pointer",
              }}
            >
              {generating
                ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />生成中...</>
                : <><Plus size={13} />招待URLを発行する</>}
            </button>
          </div>
        </form>

        {/* 発行された URL */}
        {newUrl && (
          <div style={{
            marginTop: "16px", padding: "16px", borderRadius: "8px",
            background: "#f0fdf4", border: "1px solid #86efac",
          }}>
            <p style={{ fontSize: "12px", fontWeight: "600", color: "#15803d", marginBottom: "8px" }}>
              ✓ {newCompanyName} への招待URLが発行されました
            </p>
            <p style={{ fontSize: "11px", color: "#166534", marginBottom: "10px" }}>
              以下のURLを担当者にメール等でお送りください。URLにアクセスするとパスワードを設定してすぐにご利用いただけます。有効期限は7日間です。
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                readOnly value={newUrl}
                onFocus={e => e.target.select()}
                style={{
                  flex: 1, padding: "8px 12px", border: "1px solid #86efac",
                  borderRadius: "8px", fontSize: "11.5px", fontFamily: "monospace",
                  background: "#fff", color: "#15803d", outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => handleCopy(newUrl, "new")}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "8px 14px", fontSize: "12px", fontWeight: "500",
                  background: copiedId === "new" ? "#15803d" : "#0f1f3d", color: "#fff",
                  border: "none", borderRadius: "8px", cursor: "pointer", flexShrink: 0,
                }}
              >
                {copiedId === "new" ? <Check size={13} /> : <Copy size={13} />}
                {copiedId === "new" ? "コピー済み" : "コピー"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 招待履歴 ── */}
      <p style={{ fontSize: "11px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
        招待履歴
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#8a9ab8", fontSize: "13px" }}>読み込み中...</div>
      ) : invites.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", padding: "40px", textAlign: "center", color: "#8a9ab8", fontSize: "13px" }}>
          招待履歴がありません
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e4eaf4", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ background: "#f7f9fc" }}>
                {["取引先名", "担当者", "発行日", "有効期限", "状態", ""].map(h => (
                  <th key={h} style={{
                    padding: "9px 16px", textAlign: "left",
                    fontSize: "10.5px", color: "#8a9ab8", fontWeight: "500",
                    borderBottom: "1px solid #e4eaf4", textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...activeInvites, ...usedInvites, ...expiredInvites].map(inv => {
                const s = STATUS[inv.status]
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/register?invite=${inv.token}`
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #f0f4fa" }}>
                    <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f1f3d" }}>{inv.companyName}</td>
                    <td style={{ padding: "10px 16px", color: "#4e6a9c" }}>{inv.contactName || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "#8a9ab8", fontSize: "11.5px" }}>{fmt(inv.createdAt)}</td>
                    <td style={{ padding: "10px 16px", color: "#8a9ab8", fontSize: "11.5px" }}>
                      {inv.usedAt ? `使用: ${fmt(inv.usedAt)}` : fmt(inv.expiresAt)}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontSize: "11px", fontWeight: "500",
                        color: s.color, background: s.bg,
                        border: `1px solid ${s.border}`,
                        borderRadius: "999px", padding: "2px 9px",
                      }}>{s.label}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {inv.status === "active" && (
                        <button
                          onClick={() => handleCopy(url, inv.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            padding: "4px 10px", fontSize: "11px", fontWeight: "500",
                            background: copiedId === inv.id ? "#0f1f3d" : "#fff",
                            color: copiedId === inv.id ? "#fff" : "#0f1f3d",
                            border: "1px solid #0f1f3d", borderRadius: "6px", cursor: "pointer",
                          }}
                        >
                          {copiedId === inv.id ? <Check size={11} /> : <Copy size={11} />}
                          URLをコピー
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
