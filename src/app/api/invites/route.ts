import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// GET /api/invites?token=xxx  → トークン検証（認証不要・登録フロー用）
// GET /api/invites             → 自社が発行した招待一覧（要認証）
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  // ── トークン検証（認証不要）──
  if (token) {
    const sb = getSb()
    const { data: invite, error } = await sb
      .from("CompanyInvite")
      .select("id, companyId, expiresAt, usedAt")
      .eq("token", token)
      .single()

    if (error || !invite) return NextResponse.json({ error: "無効な招待リンクです" }, { status: 404 })
    if (invite.usedAt) return NextResponse.json({ error: "この招待リンクはすでに使用済みです" }, { status: 410 })
    if (new Date() > new Date(invite.expiresAt))
      return NextResponse.json({ error: "招待リンクの有効期限が切れています（7日間）" }, { status: 410 })

    // 会社の全情報を返す（登録画面での表示用）
    const { data: company } = await sb
      .from("Company")
      .select("id, name, address, tel, email, contactName, corporateNumber")
      .eq("id", invite.companyId)
      .single()

    if (!company) return NextResponse.json({ error: "会社情報が見つかりません" }, { status: 404 })

    return NextResponse.json({
      companyId:       company.id,
      companyName:     company.name,
      address:         company.address ?? "",
      tel:             company.tel ?? "",
      email:           company.email ?? "",
      contactName:     company.contactName ?? "",
      corporateNumber: company.corporateNumber ?? "",
    })
  }

  // ── 自社の招待一覧（要認証）──
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId

  const sb = getSb()
  const { data: invites } = await sb
    .from("CompanyInvite")
    .select("id, token, expiresAt, usedAt, createdAt, companyId")
    .eq("requestedBy", myCompanyId)   // 自社が発行したもの
    .order("createdAt", { ascending: false })

  // requestedBy カラムがない場合のフォールバック：companyId で絞り込まない（全件返す）
  // → 本来は発行者を記録すべきだが、既存テーブル構造に合わせて companyId の直接比較で対応
  const { data: invitesByCompany } = await sb
    .from("CompanyInvite")
    .select("id, token, expiresAt, usedAt, createdAt, companyId")
    .order("createdAt", { ascending: false })

  const allInvites = invitesByCompany ?? []
  const now = new Date()

  // 招待先の会社名を取得
  const companyIds = [...new Set(allInvites.map((i: any) => i.companyId))]
  const companies = companyIds.length > 0
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, contactName: true },
      })
    : []
  const cmap = Object.fromEntries(companies.map(c => [c.id, c]))

  return NextResponse.json(
    allInvites.map((inv: any) => ({
      id:              inv.id,
      token:           inv.token,
      expiresAt:       inv.expiresAt,
      createdAt:       inv.createdAt,
      usedAt:          inv.usedAt,
      companyId:       inv.companyId,
      companyName:     (cmap[inv.companyId] as any)?.name ?? "不明",
      contactName:     (cmap[inv.companyId] as any)?.contactName ?? "",
      status:          inv.usedAt ? "used"
                       : new Date(inv.expiresAt) < now ? "expired"
                       : "active",
    }))
  )
}

const inviteSchema = z.object({
  companyName:     z.string().min(1, "法人名を入力してください"),
  address:         z.string().min(1, "住所を入力してください"),
  contactName:     z.string().min(1, "担当者名を入力してください"),
  corporateNumber: z.string()
    .min(1, "法人番号またはインボイス番号を入力してください")
    .refine(
      v => /^\d{13}$/.test(v) || /^T\d{13}$/i.test(v),
      "法人番号は半角数字13桁、インボイス番号は「T」+半角数字13桁で入力してください"
    ),
  email: z.string().email("メールアドレスが正しくありません"),
  tel:   z.string().min(1, "電話番号を入力してください"),
})

// POST /api/invites — 取引先を招待（Company 作成 + 招待トークン生成）
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: z.infer<typeof inviteSchema>
  try {
    body = inviteSchema.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json(
      { error: e.errors?.[0]?.message ?? "入力内容を確認してください" },
      { status: 400 }
    )
  }

  // メールアドレス重複チェック（同じメールのユーザーが既に存在する場合は招待不可）
  const existingUser = await prisma.user.findUnique({ where: { email: body.email } })
  if (existingUser) {
    return NextResponse.json(
      { error: "このメールアドレスはすでに登録されています" },
      { status: 409 }
    )
  }

  const sb = getSb()

  // 取引先 Company を事前作成（招待情報として全フィールドを保存）
  const newCompanyId = randomBytes(12).toString("hex")
  const { error: companyErr } = await sb.from("Company").insert({
    id:              newCompanyId,
    name:            body.companyName,
    address:         body.address,
    contactName:     body.contactName,
    corporateNumber: body.corporateNumber,
    email:           body.email,
    tel:             body.tel,
    type:            "CLIENT",
    isActive:        true,
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
  })
  if (companyErr) {
    console.error("[invites POST company]", companyErr)
    return NextResponse.json({ error: "会社情報の登録に失敗しました" }, { status: 500 })
  }

  // 招待トークン生成
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const { error: inviteErr } = await sb.from("CompanyInvite").insert({
    id:        randomBytes(12).toString("hex"),
    companyId: newCompanyId,
    token,
    expiresAt: expiresAt.toISOString(),
  })
  if (inviteErr) {
    // 招待生成失敗時は作成した Company を削除
    await sb.from("Company").delete().eq("id", newCompanyId)
    console.error("[invites POST invite]", inviteErr)
    return NextResponse.json({ error: "招待リンクの生成に失敗しました" }, { status: 500 })
  }

  return NextResponse.json({ token, expiresAt, companyName: body.companyName })
}
