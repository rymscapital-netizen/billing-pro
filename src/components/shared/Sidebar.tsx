"use client"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  FileText,
  Building2,
  Settings,
  Link2,
  UserPlus,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  dot?: boolean
}

const adminNav: NavItem[] = [
  { label: "ダッシュボード", href: "/admin/dashboard",     icon: <LayoutDashboard size={14} /> },
  { label: "請求書一覧",    href: "/admin/invoices",       icon: <FileText size={14} />, dot: true },
  { label: "取引先管理",    href: "/admin/companies",      icon: <Building2 size={14} /> },
  { label: "取引先連携",    href: "/admin/connections",    icon: <Link2 size={14} /> },
  { label: "取引先招待",  href: "/admin/invites",        icon: <UserPlus size={14} /> },
  { label: "設定",          href: "/admin/settings",       icon: <Settings size={14} /> },
]

const clientNav: NavItem[] = [
  { label: "ダッシュボード", href: "/client/dashboard",    icon: <LayoutDashboard size={14} /> },
  { label: "請求書一覧",    href: "/client/invoices",      icon: <FileText size={14} />, dot: true },
  { label: "取引先連携",    href: "/client/connections",   icon: <Link2 size={14} /> },
  { label: "取引先招待",  href: "/client/invites",       icon: <UserPlus size={14} /> },
  { label: "設定",        href: "/client/settings",      icon: <Settings size={14} /> },
]

interface SidebarProps {
  role: "ADMIN" | "CLIENT"
  userName: string
  companyName: string
}

export function Sidebar({ role, userName, companyName }: SidebarProps) {
  const pathname = usePathname()
  const navItems = role === "ADMIN" ? adminNav : clientNav
  return (
    <aside className="w-[214px] bg-navy-900 flex flex-col flex-shrink-0 h-screen sticky top-0">
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.07]">
        <div className="text-white text-[16px] font-medium tracking-[0.03em]">
          Billing<span className="text-gold-300">Pro</span>
        </div>
        <div className="text-white/30 text-[10px] mt-1 tracking-[0.08em] uppercase">
          請求管理システム
        </div>
      </div>
      <nav className="flex-1 pt-2">
        <div className="text-white/25 text-[10px] px-5 pt-4 pb-1 tracking-[0.10em] uppercase">
          メイン
        </div>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}>
              <div className={`nav-item ${isActive ? "active" : ""}`}>
                <span className="flex-shrink-0 opacity-70">{item.icon}</span>
                <span>{item.label}</span>
                {item.dot && (
                  <span className="ml-auto w-[5px] h-[5px] rounded-full bg-red-400 animate-pulse-dot" />
                )}
              </div>
            </Link>
          )
        })}
      </nav>
      <Link href={role === "ADMIN" ? "/admin/settings" : "/client/settings"}>
        <div className="px-5 py-4 border-t border-white/[0.07] hover:bg-white/[0.05] transition-colors cursor-pointer">
          <div className="text-white/60 text-[12px] font-medium truncate">{userName}</div>
          <div className="text-white/30 text-[11px] mt-0.5 truncate">{companyName}</div>
          <div className="text-white/25 text-[10px] mt-1 tracking-wide">アカウント設定 →</div>
        </div>
      </Link>
    </aside>
  )
}
