"use client"

import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"

interface TopbarProps {
  title: string
  role: "ADMIN" | "CLIENT"
  userName: string
}

export function Topbar({ title, role, userName }: TopbarProps) {
  return (
    <header className="h-[52px] bg-white border-b border-navy-100 flex-shrink-0
                        flex items-center justify-between px-7">
      <h1 className="text-[15px] font-medium text-navy-900">{title}</h1>

      <div className="flex items-center gap-3">
        <span className={`badge text-[11px] py-[3px] px-[11px] tracking-[0.04em] ${
          role === "ADMIN"
            ? "bg-gold-50 text-gold-700 border-gold-300"
            : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }`}>
          {role === "ADMIN" ? "管理者" : "取引先"}
        </span>

        <span className="text-[12px] text-navy-400">{userName}</span>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="btn btn-icon text-navy-400 hover:text-navy-700 border-transparent"
          title="ログアウト"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  )
}
