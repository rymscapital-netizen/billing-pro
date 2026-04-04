import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// PATCH /api/connections/[id] — 承認・拒否
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId
  const { id } = await params

  const { action } = await req.json() // "approve" | "reject"

  const sb = getSb()
  const { data: link, error: fetchErr } = await sb
    .from("CompanyLink")
    .select("*")
    .eq("id", id)
    .single()

  if (fetchErr || !link) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // 自社が関係しているか確認
  if (link.companyAId !== myCompanyId && link.companyBId !== myCompanyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // 申請者自身は承認・拒否できない
  if (link.requestedByCompanyId === myCompanyId)
    return NextResponse.json({ error: "申請者は承認・拒否できません" }, { status: 403 })

  if (action === "approve") {
    const { data: updated, error } = await sb
      .from("CompanyLink")
      .update({ status: "APPROVED", updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: "承認に失敗しました" }, { status: 500 })
    return NextResponse.json(updated)
  }

  if (action === "reject") {
    const { error } = await sb.from("CompanyLink").delete().eq("id", id)
    if (error) return NextResponse.json({ error: "拒否に失敗しました" }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}

// DELETE /api/connections/[id] — 紐づけ解除
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId
  const { id } = await params

  const sb = getSb()
  const { data: link, error: fetchErr } = await sb
    .from("CompanyLink")
    .select("companyAId, companyBId")
    .eq("id", id)
    .single()

  if (fetchErr || !link) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (link.companyAId !== myCompanyId && link.companyBId !== myCompanyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await sb.from("CompanyLink").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "解除に失敗しました" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
