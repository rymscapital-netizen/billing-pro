import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/shared/Sidebar"
import { Topbar } from "@/components/shared/Topbar"
import { headers } from "next/headers"

function resolveTitle(pathname: string): string {
  const map: Record<string, string> = {
    "/client/dashboard": "ダッシュボード",
    "/client/invoices":  "請求書確認",
  }
  for (const [key, val] of Object.entries(map)) {
    if (pathname.startsWith(key)) return val
  }
  return "請求書ポータル"
}

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session || session.user.role !== "CLIENT") redirect("/login")

  const headerList = await headers()
  const pathname = headerList.get("x-pathname") ?? "/client/dashboard"
  const title = resolveTitle(pathname)

  return (
    <div className="flex h-screen bg-navy-50 overflow-hidden">
      <Sidebar
        role="CLIENT"
        userName={session.user.name}
        companyName={session.user.companyName}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} role="CLIENT" userName={session.user.name} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
