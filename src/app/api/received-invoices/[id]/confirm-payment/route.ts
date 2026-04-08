import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

const schema = z.object({
  paidAt: z.string(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const u = session.user as any

  const sb = getSb()

  // テナント確認
  const { data: target } = await sb.from("ReceivedInvoice")
    .select("ownerCompanyId").eq("id", id).limit(1)
  if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target[0].ownerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = schema.parse(await req.json())

  const { data: updated } = await sb.from("ReceivedInvoice")
    .update({ status: "PAID", paidAt: new Date(body.paidAt).toISOString(), updatedAt: new Date().toISOString() })
    .eq("id", id).select().limit(1)

  return NextResponse.json(updated?.[0])
}
