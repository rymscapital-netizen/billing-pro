"use client"

import { useState, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const registered = params.get("registered") === "1"

  const [email, setEmail]     = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]     = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", { email, password, redirect: false })

    if (result?.error) {
      setError("メールアドレスまたはパスワードが正しくありません")
      setLoading(false)
      return
    }

    // ロールを取得してリダイレクト先を決定
    const session = await fetch("/api/auth/session").then(r => r.json())
    const role = session?.user?.role
    router.push(role === "CLIENT" ? "/client/dashboard" : "/admin/dashboard")
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1f3d",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
    }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "28px", fontWeight: "600", color: "#fff" }}>
            Billing<span style={{ color: "#e2c060" }}>Pro</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginTop: "8px" }}>
            請求管理システム
          </p>
        </div>

        <div style={{
          background: "#fff", borderRadius: "12px",
          padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}>
          <h1 style={{ fontSize: "15px", fontWeight: "600", color: "#0f1f3d", marginBottom: "20px" }}>
            ログイン
          </h1>

          {registered && (
            <div style={{
              background: "#f0fdf4", border: "1px solid #86efac",
              borderRadius: "8px", padding: "10px 12px",
              marginBottom: "16px", fontSize: "12px", color: "#166534",
            }}>
              ✓ アカウントを登録しました。ログインしてください。
            </div>
          )}

          {error && (
            <div style={{
              background: "#fdf0f0", border: "1px solid #f0b8b8",
              borderRadius: "8px", padding: "10px 12px",
              marginBottom: "16px", fontSize: "12px", color: "#8a2020",
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "#8a9ab8", marginBottom: "4px" }}>
                メールアドレス
              </label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@billing.pro" required
                style={{
                  width: "100%", padding: "8px 11px",
                  border: "1px solid #c0cee4", borderRadius: "7px",
                  fontSize: "13px", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "#8a9ab8", marginBottom: "4px" }}>
                パスワード
              </label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: "100%", padding: "8px 11px",
                  border: "1px solid #c0cee4", borderRadius: "7px",
                  fontSize: "13px", boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                width: "100%", padding: "10px",
                background: "#0f1f3d", color: "#fff",
                border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          {/* 取引先登録リンク */}
          <div style={{
            marginTop: "16px", paddingTop: "16px",
            borderTop: "1px solid #e4eaf4",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "12px", color: "#8a9ab8", marginBottom: "8px" }}>
              取引先の方はこちらから登録
            </p>
            <Link
              href="/register"
              style={{
                display: "inline-block",
                padding: "8px 20px",
                border: "1px solid #c0cee4",
                borderRadius: "8px",
                fontSize: "12px", fontWeight: "500",
                color: "#0f1f3d", textDecoration: "none",
              }}
            >
              新規アカウント登録
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
