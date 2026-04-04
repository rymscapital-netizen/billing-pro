"use client"

import { useState, useEffect } from "react"
import { Plus, X, Building2, Link, Copy, Check } from "lucide-react"

interface Company {
  id: string
  name: string
  isActive: boolean
  invoiceCount: number
  uncollectedTotal: number
  createdAt: string
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName]     = useState("")
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")

  // 招待URLモーダル
  const [inviteCompany, setInviteCompany] = useState<Company | null>(null)
  const [inviteUrl, setInviteUrl]         = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied]               = useState(false)

  const fetchCompanies = async () => {
    setLoading(true)
    const res = await fetch("/api/companies")
    setCompanies(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchCompanies() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error("登録に失敗しました")
      setShowModal(false)
      setNewName("")
      fetchCompanies()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateInvite = async (company: Company) => {
    setInviteCompany(company)
    setInviteUrl("")
    setCopied(false)
    setInviteLoading(true)
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました")
      const origin = window.location.origin
      setInviteUrl(`${origin}/register?invite=${data.token}`)
    } catch (e: any) {
      setInviteUrl("")
      alert(e.message)
      setInviteCompany(null)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-medium text-navy-900">取引先管理</h2>
          <p className="text-[11px] text-navy-400 mt-0.5">
            {companies.length}社登録済み
          </p>
        </div>
        <button className="btn btn-navy gap-1.5" onClick={() => setShowModal(true)}>
          <Plus size={13} />
          新規取引先
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-navy-400 text-[13px]">
            読み込み中...
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>会社名</th>
                <th className="text-right">請求書数</th>
                <th className="text-right">未収金額</th>
                <th>登録日</th>
                <th>状態</th>
                <th>招待</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-navy-100 flex items-center
                                      justify-center flex-shrink-0">
                        <Building2 size={13} className="text-navy-500" />
                      </div>
                      <span className="font-medium text-navy-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="text-right tabular text-navy-700">
                    {c.invoiceCount}件
                  </td>
                  <td className="text-right">
                    <span className={`tabular font-medium ${
                      c.uncollectedTotal > 0 ? "text-navy-900" : "text-navy-400"
                    }`}>
                      {yen(c.uncollectedTotal)}
                    </span>
                  </td>
                  <td className="muted">
                    {new Date(c.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "badge-green" : "badge-gray"}`}>
                      {c.isActive ? "有効" : "無効"}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleGenerateInvite(c)}
                      className="btn gap-1.5 text-[11px] py-1 px-2.5"
                      title="招待URLを発行"
                    >
                      <Link size={11} />
                      招待URL
                    </button>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-navy-400 py-12">
                    取引先が登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 新規取引先モーダル */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
              <div className="modal-bar" />
              <h2 className="text-[15px] font-medium text-navy-900 flex-1">
                新規取引先を追加
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-icon text-navy-400 border-transparent"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="form-label">会社名</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="株式会社〇〇"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {error && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200
                              rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-navy-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-navy"
                >
                  {saving ? "登録中..." : "登録する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 招待URLモーダル */}
      {inviteCompany && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setInviteCompany(null)}
        >
          <div className="modal animate-fade-in" style={{ maxWidth: "480px" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="modal-bar" />
              <h2 className="text-[15px] font-medium text-navy-900 flex-1">
                招待URLを発行
              </h2>
              <button
                onClick={() => setInviteCompany(null)}
                className="btn btn-icon text-navy-400 border-transparent"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-navy-50 rounded-lg px-4 py-3">
                <p className="text-[11px] text-navy-400 mb-1">対象会社</p>
                <p className="text-[14px] font-medium text-navy-900">{inviteCompany.name}</p>
              </div>

              <p className="text-[12px] text-navy-500 leading-relaxed">
                以下のURLを担当者に共有してください。このURLからアカウントを作成すると、
                自動的に <strong>{inviteCompany.name}</strong> に紐づいてログインできます。
                有効期限は <strong>7日間</strong> です。
              </p>

              {inviteLoading ? (
                <div className="text-center py-6 text-navy-400 text-[13px]">生成中...</div>
              ) : inviteUrl ? (
                <div className="space-y-2">
                  <label className="form-label">招待URL</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="form-input text-[11px] font-mono flex-1"
                      onFocus={e => e.target.select()}
                    />
                    <button
                      onClick={handleCopy}
                      className={`btn gap-1.5 flex-shrink-0 ${copied ? "btn-navy" : ""}`}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "コピー済み" : "コピー"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-navy-100">
              <button onClick={() => setInviteCompany(null)} className="btn">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
