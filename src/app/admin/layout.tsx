import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/shared/Sidebar"
import { Topbar } from "@/components/shared/Topbar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/login")

  return (
    <div className="flex h-screen bg-navy-50 overflow-hidden">
      <Sidebar
        role="ADMIN"
        userName={session.user.name}
        companyName={session.user.companyName}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title="管理画面" role="ADMIN" userName={session.user.name} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}