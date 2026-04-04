"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

interface InviteInfo {
  companyId: string
  companyName: string
  address: string
  tel: string
  email: string
  contactName: string
  corporateNumber: string
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get("invite") ?? ""

  const [inviteInfo, setInviteInfo]       = useState<InviteInfo | null>(null)
  const [inviteError, setInviteError]     = useState("")
  const [inviteChecking, setInviteChecking] = useState(!!inviteToken)

  // 通常登録用フォーム（招待なしの場合）
  const [form, setForm] = useState({
    companyName: "", contactName: "", email: "", password: "", passwordConfirm: "",
  })
  // 招待登録用（パスワードのみ）
  const [password, setPassword]           = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [error, setError]                 = useState("")
  const [loading, setLoading]             = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    fetch(`/api/invites?token=${inviteToken}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setInviteError(d.error)
        else setInviteInfo(d)
      })
      .catch(() => setInviteError("招待リンクの確認に失敗しました"))
      .finally(() => setInviteChecking(false))
  }, [inviteToken])

  // ── 招待あり：パスワードのみ設定 ──
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== passwordConfirm) { setError("パスワードが一致しません"); return }
    if (password.length < 6) { setError("パスワードは6文字以上で入力してください"); return }
    setLoading(true); setError("")
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken, password, passwordConfirm: passwordConfirm }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? "登録に失敗しました"); setLoading(false); return }
    router.push("/login?registered=1")
  }

  // ── 通常登録 ──
  const handleNormalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.passwordConfirm) { setError("パスワードが一致しません"); return }
    setLoading(true); setError("")
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: form.companyName, contactName: form.contactName,
        email: form.email, password: form.password, passwordConfirm: form.passwordConfirm,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? "登録に失敗しました"); setLoading(false); return }
    router.push("/login?registered=1")
  }

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "8px 11px",
    border: "1px solid #c0cee4", borderRadius: "7px",
    fontSize: "13px", boxSizing: "border-box",
  }
  const readonlyStyle: React.CSSProperties = {
    ...inpStyle, background: "#f7f9fc", color: "#4e6a9c", cursor: "default",
  }
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "11px", color: "#8a9ab8", marginBottom: "4px",
  }

  if (inviteChecking) {
    return <div style={{ textAlign: "center", padding: "40px", color: "#8a9ab8", fontSize: "13px" }}>招待情報を確認中...</div>
  }

  if (inviteToken && inviteError) {
    return (
      <div style={{ textAlign: "center", padding: "24px" }}>
        <div style={{
          background: "#fdf0f0", border: "1px solid #f0b8b8", borderRadius: "8px",
          padding: "16px 20px", fontSize: "13px", color: "#8a2020", marginBottom: "20px",
        }}>
          {inviteError}
        </div>
        <Link href="/login" style={{ fontSize: "13px", color: "#0f1f3d", fontWeight: "600" }}>
          ログインページへ戻る
        </Link>
      </div>
    )
  }

  // ── 招待あり登録画面 ──
  if (inviteInfo) {
    return (
      <>
        {/* 招待元情報バナー */}
        <div style={{
          background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: "8px",
          padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: "#1a4a7a",
          lineHeight: "1.6",
        }}>
          招待によるアカウント登録です。<br />
          以下の取引先情報はすでに登録されています。<strong>パスワードを設定</strong>するとすぐにご利用いただけます。
        </div>

        {error && (
          <div style={{
            background: "#fdf0f0", border: "1px solid #f0b8b8", borderRadius: "8px",
            padding: "10px 12px", marginBottom: "16px", fontSize: "12px", color: "#8a2020",
          }}>
            {error}
          </div>
        )}

        {/* 登録済み会社情報（読み取り専用） */}
        <div style={{ background: "#f7f9fc", border: "1px solid #e4eaf4", borderRadius: "8px", padding: "14px 16px", marginBottom: "20px" }}>
          <p style={{ fontSize: "10.5px", color: "#8a9ab8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
            登録済みの取引先情報
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { label: "法人名",   value: inviteInfo.companyName },
              { label: "住所",     value: inviteInfo.address },
              { label: "担当者名", value: inviteInfo.contactName },
              { label: "法人番号 / インボイス番号", value: inviteInfo.corporateNumber },
              { label: "メールアドレス", value: inviteInfo.email },
              { label: "電話番号", value: inviteInfo.tel },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#8a9ab8" }}>{label}</span>
                <span style={{ fontSize: "13px", color: "#0f1f3d", fontWeight: "500" }}>{value || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* パスワード設定フォーム */}
        <form onSubmit={handleInviteSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={lbl}>パスワード（6文字以上）<span style={{ color: "#c43030" }}>*</span></label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6} style={inpStyle} />
          </div>
          <div>
            <label style={lbl}>パスワード（確認）<span style={{ color: "#c43030" }}>*</span></label>
            <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
              placeholder="••••••••" required style={inpStyle} />
          </div>
          <button
            type="submit" disabled={loading}
            style={{
              marginTop: "6px", width: "100%", padding: "10px",
              background: "#0f1f3d", color: "#fff", border: "none", borderRadius: "8px",
              fontSize: "14px", fontWeight: "500",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "アカウントを有効化中..." : "アカウントを有効化する"}
          </button>
        </form>
      </>
    )
  }

  // ── 通常登録画面 ──
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      {error && (
        <div style={{
          background: "#fdf0f0", border: "1px solid #f0b8b8", borderRadius: "8px",
          padding: "10px 12px", marginBottom: "16px", fontSize: "12px", color: "#8a2020",
        }}>
          {error}
        </div>
      )}
      <form onSubmit={handleNormalSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={lbl}>会社名 <span style={{ color: "#c43030" }}>*</span></label>
          <input type="text" value={form.companyName} onChange={set("companyName")}
            placeholder="株式会社サンプル" required style={inpStyle} />
        </div>
        <div>
          <label style={lbl}>担当者名 <span style={{ color: "#c43030" }}>*</span></label>
          <input type="text" value={form.contactName} onChange={set("contactName")}
            placeholder="山田 太郎" required style={inpStyle} />
        </div>
        <div>
          <label style={lbl}>メールアドレス <span style={{ color: "#c43030" }}>*</span></label>
          <input type="email" value={form.email} onChange={set("email")}
            placeholder="you@example.com" required style={inpStyle} />
        </div>
        <div>
          <label style={lbl}>パスワード（6文字以上）<span style={{ color: "#c43030" }}>*</span></label>
          <input type="password" value={form.password} onChange={set("password")}
            placeholder="••••••••" required minLength={6} style={inpStyle} />
        </div>
        <div>
          <label style={lbl}>パスワード（確認）<span style={{ color: "#c43030" }}>*</span></label>
          <input type="password" value={form.passwordConfirm} onChange={set("passwordConfirm")}
            placeholder="••••••••" required style={inpStyle} />
        </div>
        <button
          type="submit" disabled={loading}
          style={{
            marginTop: "6px", width: "100%", padding: "10px",
            background: "#0f1f3d", color: "#fff", border: "none", borderRadius: "8px",
            fontSize: "14px", fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "登録中..." : "アカウントを作成する"}
        </button>
      </form>
      <div style={{
        marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e4eaf4",
        textAlign: "center", fontSize: "12px", color: "#8a9ab8",
      }}>
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" style={{ color: "#0f1f3d", fontWeight: "600", textDecoration: "none" }}>ログイン</Link>
      </div>
    </>
  )
}

export default function RegisterPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#0f1f3d",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
    }}>
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "28px", fontWeight: "600", color: "#fff" }}>
            Billing<span style={{ color: "#e2c060" }}>Pro</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginTop: "8px" }}>
            アカウント登録
          </p>
        </div>
        <div style={{
          background: "#fff", borderRadius: "12px",
          padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}>
          <h1 style={{ fontSize: "15px", fontWeight: "600", color: "#0f1f3d", marginBottom: "20px" }}>
            新規登録
          </h1>
          <Suspense fallback={<div style={{ textAlign: "center", padding: "40px", color: "#8a9ab8", fontSize: "13px" }}>読み込み中...</div>}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
