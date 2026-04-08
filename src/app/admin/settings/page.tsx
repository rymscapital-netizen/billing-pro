"use client"

import { useState, useEffect } from "react"
import { Building2, UserPlus, Save, Eye, EyeOff, KeyRound } from "lucide-react"
import { useSession } from "next-auth/react"

export default function SettingsPage() {
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

  const [name,       setName]       = useState("")
  const [address,    setAddress]    = useState("")
  const [tel,        setTel]        = useState("")
  const [email,       setEmail]       = useState("")
  const [contactName, setContactName] = useState("")
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoSaved,  setInfoSaved]  = useState(false)

  const [companies,    setCompanies]    = useState<any[]>([])
  const [adminCompanyId, setAdminCompanyId] = useState("")   // 自社（ADMIN会社）のID

  // 自社スタッフ追加
  const [staffName,     setStaffName]     = useState("")
  const [staffEmail,    setStaffEmail]    = useState("")
  const [staffPassword, setStaffPassword] = useState("")
  const [showStaffPass, setShowStaffPass] = useState(false)
  const [addingStaff,   setAddingStaff]   = useState(false)
  const [staffAdded,    setStaffAdded]    = useState(false)

  // 取引先ユーザー追加（既存）
  const [userName,     setUserName]     = useState("")
  const [userEmail,    setUserEmail]    = useState("")
  const [userPassword, setUserPassword] = useState("")
  const [userCompany,  setUserCompany]  = useState("")
  const [userRole,     setUserRole]     = useState<"ADMIN"|"CLIENT">("CLIENT")
  const [showPass,     setShowPass]     = useState(false)
  const [addingUser,   setAddingUser]   = useState(false)
  const [userAdded,    setUserAdded]    = useState(false)
  const [users,        setUsers]        = useState<any[]>([])

  // セッションからアカウント情報を初期化
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
    fetch("/api/settings").then(r => r.json()).then(d => {
      if (!d) return
      setName(d.name ?? "")
      setAddress(d.address ?? "")
      setTel(d.tel ?? "")
      setEmail(d.email ?? "")
      setContactName(d.contactName ?? "")
      setAdminCompanyId(d.id ?? "")
    })
    fetch("/api/companies").then(r => r.ok ? r.json() : []).then(setCompanies).catch(() => {})
    fetch("/api/users").then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {})
  }, [])

  const handleAddStaff = async () => {
    if (!staffName || !staffEmail || !staffPassword || !adminCompanyId) return
    setAddingStaff(true)
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staffName, email: staffEmail, password: staffPassword,
        role: "ADMIN", companyId: adminCompanyId,
      }),
    })
    if (res.ok) {
      const newUser = await res.json()
      setUsers(prev => [newUser, ...prev])
      setStaffName(""); setStaffEmail(""); setStaffPassword("")
      setStaffAdded(true)
      setTimeout(() => setStaffAdded(false), 3000)
    }
    setAddingStaff(false)
  }

  const handleSaveInfo = async () => {
    setSavingInfo(true)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, tel, email, contactName }),
    })
    setSavingInfo(false)
    setInfoSaved(true)
    setTimeout(() => setInfoSaved(false), 3000)
  }

  const handleAddUser = async () => {
    if (!userName || !userEmail || !userPassword || !userCompany) return
    setAddingUser(true)
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: userName, email: userEmail, password: userPassword,
        role: userRole, companyId: userCompany,
      }),
    })
    if (res.ok) {
      const newUser = await res.json()
      setUsers(prev => [newUser, ...prev])
      setUserName(""); setUserEmail(""); setUserPassword(""); setUserCompany("")
      setUserAdded(true)
      setTimeout(() => setUserAdded(false), 3000)
    }
    setAddingUser(false)
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

      {/* 自社情報 */}
      <div className="bg-white rounded-lg border border-navy-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 size={15} className="text-navy-400" />
          <h2 className="text-[14px] font-medium text-navy-900">自社情報</h2>
        </div>
        <div className="space-y-4">
          {[
            { label: "会社名",         value: name,    set: setName },
            { label: "住所",           value: address, set: setAddress },
            { label: "電話番号",       value: tel,     set: setTel },
            { label: "メールアドレス", value: email,       set: setEmail },
            { label: "担当者名",       value: contactName, set: setContactName },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">{label}</label>
              <input
                type="text"
                value={value}
                onChange={e => set(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-navy-100">
          <button
            onClick={handleSaveInfo}
            disabled={savingInfo}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 disabled:opacity-60 transition-colors"
          >
            <Save size={13} />
            {savingInfo ? "保存中..." : "保存する"}
          </button>
          {infoSaved && <span className="text-[12px] text-emerald-600">✓ 保存しました</span>}
        </div>
      </div>

      {/* 自社スタッフ登録 */}
      <div className="bg-white rounded-lg border border-navy-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus size={15} className="text-navy-400" />
          <h2 className="text-[14px] font-medium text-navy-900">自社スタッフ登録</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">氏名</label>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">パスワード</label>
              <div className="relative">
                <input
                  type={showStaffPass ? "text" : "password"}
                  value={staffPassword}
                  onChange={e => setStaffPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 pr-9"
                  placeholder="6文字以上"
                />
                <button type="button" onClick={() => setShowStaffPass(!showStaffPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                  {showStaffPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-navy-100">
          <button
            onClick={handleAddStaff}
            disabled={addingStaff || !staffName || !staffEmail || !staffPassword || !adminCompanyId}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 disabled:opacity-60 transition-colors"
          >
            <UserPlus size={13} />
            {addingStaff ? "登録中..." : "スタッフを登録"}
          </button>
          {staffAdded && <span className="text-[12px] text-emerald-600">✓ スタッフを登録しました</span>}
        </div>
      </div>

      {/* ユーザー追加 */}
      <div className="bg-white rounded-lg border border-navy-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus size={15} className="text-navy-400" />
          <h2 className="text-[14px] font-medium text-navy-900">ユーザー追加</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">氏名</label>
              <input type="text" value={userName} onChange={e => setUserName(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400"
                placeholder="山田 太郎" />
            </div>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">メールアドレス</label>
              <input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400"
                placeholder="user@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">パスワード</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 pr-9"
                  placeholder="6文字以上"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">権限</label>
              <select value={userRole} onChange={e => setUserRole(e.target.value as "ADMIN"|"CLIENT")}
                className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 bg-white">
                <option value="ADMIN">管理者</option>
                <option value="CLIENT">取引先</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-navy-400 uppercase tracking-wider mb-1">所属会社</label>
            <select value={userCompany} onChange={e => setUserCompany(e.target.value)}
              className="w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-navy-400 bg-white">
              <option value="">会社を選択してください</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-navy-100">
          <button
            onClick={handleAddUser}
            disabled={addingUser || !userName || !userEmail || !userPassword || !userCompany}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-white text-[13px] font-medium rounded-lg hover:bg-navy-700 disabled:opacity-60 transition-colors"
          >
            <UserPlus size={13} />
            {addingUser ? "追加中..." : "ユーザーを追加"}
          </button>
          {userAdded && <span className="text-[12px] text-emerald-600">✓ ユーザーを追加しました</span>}
        </div>
      </div>

      {/* ユーザー一覧（法人・担当者） */}
      <div className="bg-white rounded-lg border border-navy-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-navy-100 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-navy-900">登録ユーザー一覧</h2>
          <span className="text-[11px] text-navy-400">{users.length}名</span>
        </div>
        {/* 法人グループ別に表示 */}
        {(() => {
          type Group = { companyName: string; members: any[] }
          const grouped = users.reduce((acc: Record<string, Group>, u: any) => {
            const key = u.company?.id ?? "unknown"
            if (!acc[key]) acc[key] = { companyName: u.company?.name ?? "不明", members: [] }
            acc[key].members.push(u)
            return acc
          }, {})
          return (Object.entries(grouped) as [string, Group][]).map(([cid, { companyName, members }]) => (
            <div key={cid}>
              <div className="px-5 py-2 bg-navy-50 border-b border-navy-100 flex items-center gap-2">
                <span className="text-[10.5px] font-semibold text-navy-500 uppercase tracking-wider">法人</span>
                <span className="text-[12px] font-medium text-navy-800">{companyName}</span>
                <span className="text-[10.5px] text-navy-400 ml-auto">{(members as any[]).length}名</span>
              </div>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-white border-b border-navy-100">
                    {["氏名","メールアドレス","役割","ステータス"].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-[10.5px] text-navy-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(members as any[]).map((u: any) => (
                    <tr key={u.id} className="border-b border-navy-100 last:border-0 hover:bg-navy-50">
                      <td className="px-4 py-3 font-medium text-navy-900">{u.name}</td>
                      <td className="px-4 py-3 text-navy-500 text-[12px]">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          u.role === "ADMIN" ? "bg-navy-100 text-navy-700" : "bg-gold-50 text-gold-700"
                        }`}>
                          {u.role === "ADMIN" ? "管理者（担当者）" : "取引先ユーザー"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}>
                          {u.isActive ? "有効" : "無効"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        })()}
        {users.length === 0 && (
          <p className="text-center text-navy-400 py-8 text-[13px]">ユーザーがいません</p>
        )}
      </div>
    </div>
  )
}
