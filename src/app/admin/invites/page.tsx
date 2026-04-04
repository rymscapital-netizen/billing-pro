import { auth } from "@/lib/auth"
import { InvitesPage } from "@/components/InvitesPage"

export default async function AdminInvitesPage() {
  const session = await auth()
  const companyId = (session?.user as any)?.companyId ?? ""
  return <InvitesPage adminCompanyId={companyId} />
}
