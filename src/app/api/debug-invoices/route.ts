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

  // Test 1: シンプルクエリ
  const { data: simple, error: e1 } = await sb
    .from("Invoice")
    .select("id, invoiceNumber, issuerCompanyId, companyId, status")
    .eq("issuerCompanyId", u.companyId)

  // Test 2: 実際のinvoices GETと同じクエリ
  const selectFields = "*, company:Company(id,name), payments:InvoicePayment(*), profit:InvoiceProfit(*), assignedUser:User!Invoice_assignedUserId_fkey(id,name)"
  const { data: full, error: e2 } = await sb
    .from("Invoice")
    .select(selectFields)
    .eq("issuerCompanyId", u.companyId)
    .order("dueDate", { ascending: true })

  return NextResponse.json({
    companyId: u.companyId,
    role: u.role,
    simple: { count: simple?.length, error: e1?.message },
    full:   { count: full?.length,   error: e2?.message },
  })
}
