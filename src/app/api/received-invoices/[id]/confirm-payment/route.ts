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
  // ADMIN・CLIENT 両方許可
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  const sb = getSb()

  // ownerCompanyId でテナント確認（ロールに関わらず自社の被請求書のみ操作可）
  const { data: target } = await sb.from("ReceivedInvoice")
    .select("ownerCompanyId").eq("id", id).limit(1)
  if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target[0].ownerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = schema.parse(await req.json())

  const { data: updated } = await sb.from("ReceivedInvoice")
    .update({
      status:    "PAID",
      paidAt:    new Date(body.paidAt).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq("id", id).select().limit(1)

  return NextResponse.json(updated?.[0])
}
