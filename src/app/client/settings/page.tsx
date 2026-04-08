"use client"

import { useState, useEffect } from "react"
import { UserPlus, Eye, EyeOff, KeyRound, Save } from "lucide-react"
import { useSession } from "next-auth/react"

export default function ClientSettingsPage() {
  const { data: session, update: updateSession } = useSession()

  // アカウント設定
  const [acctName,        setAcctName]        = useState("")
  const [acctEmail,       setAcctEmail]       = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword,     setNewPassword]     = useState("")
  const [showCurrPass,    setShowCurrPass]    = useState(false)
  const [showNewPass,     setShowNewPass]     = useState(false)
  const [acctSaving,      setAcctSaving]      = useState(false)
  const [acctMsg,         setAcctMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  const [companyId, setCompanyId] = useState("")
  const [staffName,     setStaffName]     = useState("")
  const [staffEmail,    setStaffEmail]    = useState("")
  const [staffPassword, setStaffPassword] = useState("")
  const [showPass,      setShowPass]      = useState(false)
  const [adding,        setAdding]        = useState(false)
  const [added,         setAdded]         = useState(false)
  const [error,         setError]         = useState("")
  const [users,         setUsers]         = useState<any[]>([])

  useEffect(() => {
    if (session?.user) {
      setAcctName((session.user as any).name ?? "")
      setAcctEmail(session.user.email ?? "")
    }
  }, [session])

  const handleSaveAccount = async () => {
    setAcctSaving(true); setAcctMsg(null)
    const body: any = {}
    if (acctName  !== (session?.user as any)?.name)  body.name  = acctName
    if (acctEmail !== session?.user?.email)           body.email = acctEmail
    if (newPassword) {
      body.currentPassword = currentPassword
      body.newPassword     = newPassword
    }
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) {
      setAcctMsg({ ok: false, text: d.error ?? "保存に失敗しました" })
    } else {
      await updateSession({ name: acctName, email: acctEmail })
      setCurrentPassword(""); setNewPassword("")
      setAcctMsg({ ok: true, text: "保存しました" })
      setTimeout(() => setAcctMsg(null), 3000)
    }
    setAcctSaving(false)
  }

  useEffect(() => {
    // 自社情報を取得（companyId はセッションから）
    fetch("/api/users")
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        setUsers(list)
        if (list.length > 0) setCompanyId(list[0].companyId)
      })
  }, [])

  const handleAdd = async () => {
    if (!staffName || !staffEmail || !staffPassword || !companyId) return
    setAdding(true); setError("")
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staffName, email: staffEmail, password: staffPassword,
        role: "CLIENT", companyId,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? "登録に失敗しました"); setAdding(false); return }
    setUsers(prev => [d, ...prev])
    setStaffName(""); setStaffEmail(""); setStaffPassword("")
    setAdded(true); setTimeout(() => setAdded(false), 3000)
    setAdding(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <h1 className="text-[18px] font-medium text-navy-900">設定</h1>

      {/* アカウント設定 */}
      <div className="bg-white rounded-lg border border-navy-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={15} className="text-navy-400" />
          <h2 className="text-[14px] font-medium text-navy-900">アカウント設定</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">氏名</label>
              <input type="text" value={acctName} onChange={e => setAcctName(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400" />
            </div>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">メールアドレス（ログインID）</label>
              <input type="email" value={acctEmail} onChange={e => setAcctEmail(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400" />
            </div>
          </div>
          <p className="text-[11px] text-navy-400">パスワードを変更する場合のみ入力してください</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">現在のパスワード</label>
              <div className="relative">
                <input
                  type={showCurrPass ? "text" : "password"}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 pr-9"
                  placeholder="現在のパスワード"
                />
                <button type="button" onClick={() => setShowCurrPass(!showCurrPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                  {showCurrPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">新しいパスワード（6文字以上）</label>
              <div className="relative">
                <input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 pr-9"
                  placeholder="新しいパスワード"
                />
                <button type="button" onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                  {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
        {acctMsg && (
          <p className={`text-[12px] mt-3 px-3 py-2 rounded-lg border ${acctMsg.ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>
            {acctMsg.ok ? "✓ " : ""}{acctMsg.text}
          </p>
        )}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-navy-100">
          <button
            onClick={handleSaveAccount}
            disabled={acctSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 disabled:opacity-60 transition-colors"
          >
            <Save size={13} />
            {acctSaving ? "保存中..." : "変更を保存"}
          </button>
        </div>
      </div>

      {/* 自社スタッフ登録 */}
      <div className="bg-white rounded-lg border border-navy-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus size={15} className="text-navy-400" />
          <h2 className="text-[14px] font-medium text-navy-900">自社スタッフを登録</h2>
        </div>
        <p className="text-[12px] text-navy-400 mb-4 leading-relaxed">
          登録したスタッフはダッシュボード・請求書・被請求書の担当者フィルターに自動で追加されます。
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">担当者名</label>
              <input type="text" value={staffName} onChange={e => setStaffName(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400"
                placeholder="田中 一郎" />
            </div>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">メールアドレス</label>
              <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400"
                placeholder="staff@example.com" />
            </div>
          </div>
          <div style={{ maxWidth: "260px" }}>
            <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">パスワード（6文字以上）</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={staffPassword}
                onChange={e => setStaffPassword(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 pr-9"
                placeholder="6文字以上"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-navy-100">
          <button
            onClick={handleAdd}
            disabled={adding || !staffName || !staffEmail || !staffPassword}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 disabled:opacity-60 transition-colors"
          >
            <UserPlus size={13} />
            {adding ? "登録中..." : "スタッフを登録"}
          </button>
          {added && <span className="text-[12px] text-emerald-600">✓ 登録しました。担当者フィルターに追加されます。</span>}
        </div>
      </div>

      {/* 登録済みスタッフ一覧 */}
      <div className="bg-white rounded-lg border border-navy-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-navy-100 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-navy-900">自社スタッフ一覧</h2>
          <span className="text-[11px] text-navy-400">{users.length}名</span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-navy-50 border-b border-navy-100">
              {["担当者名", "メールアドレス", "ステータス"].map(h => (
                <th key={h} className="text-left px-4 py-2 text-[10.5px] text-navy-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-navy-100 last:border-0 hover:bg-navy-50">
                <td className="px-4 py-3 font-medium text-navy-900">{u.name}</td>
                <td className="px-4 py-3 text-navy-500 text-[12px]">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {u.isActive ? "有効" : "無効"}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={3} className="text-center text-navy-400 py-8 text-[13px]">スタッフが登録されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
