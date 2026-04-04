import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// ── 招待あり（パスワードのみ必須） ──
const inviteSchema = z.object({
  inviteToken:     z.string().min(1),
  password:        z.string().min(6, "パスワードは6文字以上で入力してください"),
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  message: "パスワードが一致しません",
  path: ["passwordConfirm"],
})

// ── 通常登録（全項目必須） ──
const normalSchema = z.object({
  companyName:     z.string().min(1, "会社名を入力してください"),
  contactName:     z.string().min(1, "担当者名を入力してください"),
  email:           z.string().email("メールアドレスが正しくありません"),
  password:        z.string().min(6, "パスワードは6文字以上で入力してください"),
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  message: "パスワードが一致しません",
  path: ["passwordConfirm"],
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── 招待トークンがある場合：Companyは作成済み、Userのみ作成 ──
    if (body.inviteToken) {
      const parsed = inviteSchema.parse(body)
      const sb = getSb()

      // トークン検証
      const { data: invite, error: invErr } = await sb
        .from("CompanyInvite")
        .select("id, companyId, expiresAt, usedAt")
        .eq("token", parsed.inviteToken)
        .single()

      if (invErr || !invite)
        return NextResponse.json({ error: "無効な招待リンクです" }, { status: 400 })
      if (invite.usedAt)
        return NextResponse.json({ error: "この招待リンクはすでに使用済みです" }, { status: 400 })
      if (new Date() > new Date(invite.expiresAt))
        return NextResponse.json({ error: "招待リンクの有効期限が切れています" }, { status: 400 })

      // Companyに登録された担当者名・メールを使ってUserを作成
      const { data: company } = await sb
        .from("Company")
        .select("id, name, email, contactName")
        .eq("id", invite.companyId)
        .single()

      if (!company)
        return NextResponse.json({ error: "会社情報が見つかりません" }, { status: 400 })

      // メールアドレスの重複チェック
      const existing = await prisma.user.findUnique({ where: { email: company.email } })
      if (existing)
        return NextResponse.json({ error: "このメールアドレスはすでに登録されています" }, { status: 409 })

      const passwordHash = await bcrypt.hash(parsed.password, 12)
      const user = await prisma.user.create({
        data: {
          name:         company.contactName,
          email:        company.email,
          passwordHash,
          role:         "CLIENT",
          companyId:    invite.companyId,
          isActive:     true,
        },
      })

      // トークンを使用済みにする
      await sb.from("CompanyInvite").update({ usedAt: new Date().toISOString() }).eq("id", invite.id)

      return NextResponse.json({ ok: true, companyId: invite.companyId, userId: user.id }, { status: 201 })
    }

    // ── 通常登録：Company → User の順で作成 ──
    const parsed = normalSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } })
    if (existing)
      return NextResponse.json({ error: "このメールアドレスはすでに登録されています" }, { status: 409 })

    const passwordHash = await bcrypt.hash(parsed.password, 12)
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name:        parsed.companyName,
          contactName: parsed.contactName,
          type:        "CLIENT",
          isActive:    true,
        },
      })
      const user = await tx.user.create({
        data: {
          name:         parsed.contactName,
          email:        parsed.email,
          passwordHash,
          role:         "CLIENT",
          companyId:    company.id,
          isActive:     true,
        },
      })
      return { company, user }
    })

    return NextResponse.json(
      { ok: true, companyId: result.company.id, userId: result.user.id },
      { status: 201 }
    )
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { error: e.errors[0]?.message ?? "入力内容を確認してください" },
        { status: 400 }
      )
    }
    console.error("[register POST]", e)
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 })
  }
}
