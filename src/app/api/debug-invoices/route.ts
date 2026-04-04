import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data, error } = await sb
    .from("Invoice")
    .select("id, invoiceNumber, issuerCompanyId, companyId, status")
    .eq("issuerCompanyId", u.companyId)

  return NextResponse.json({
    sessionCompanyId: u.companyId,
    sessionRole: u.role,
    invoices: data,
    error: error?.message,
  })
}
