import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// GET /api/connections — 自社の紐づけ一覧取得
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId

  const sb = getSb()
  const { data: links, error } = await sb
    .from("CompanyLink")
    .select("*")
    .or(`companyAId.eq.${myCompanyId},companyBId.eq.${myCompanyId}`)
    .order("createdAt", { ascending: false })

  if (error) {
    console.error("[connections GET]", error)
    return NextResponse.json([], { status: 200 })
  }

  // 相手会社の名前を取得
  const otherIds = (links ?? []).map((l: any) =>
    l.companyAId === myCompanyId ? l.companyBId : l.companyAId
  )
  const companies = otherIds.length > 0
    ? await prisma.company.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, name: true },
      })
    : []
  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]))

  return NextResponse.json(
    (links ?? []).map((l: any) => {
      const otherCompanyId = l.companyAId === myCompanyId ? l.companyBId : l.companyAId
      return {
        ...l,
        otherCompanyId,
        otherCompanyName: companyMap[otherCompanyId] ?? "不明",
        isRequester: l.requestedByCompanyId === myCompanyId,
      }
    })
  )
}

// POST /api/connections — 紐づけ申請送信
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId

  const { targetCompanyId } = await req.json()
  if (!targetCompanyId) return NextResponse.json({ error: "targetCompanyId required" }, { status: 400 })
  if (targetCompanyId === myCompanyId)
    return NextResponse.json({ error: "自社への申請はできません" }, { status: 400 })

  const target = await prisma.company.findUnique({ where: { id: targetCompanyId } })
  if (!target) return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 })

  const sb = getSb()

  // 既存リンクチェック
  const { data: existing } = await sb
    .from("CompanyLink")
    .select("id, status")
    .or(
      `and(companyAId.eq.${myCompanyId},companyBId.eq.${targetCompanyId}),and(companyAId.eq.${targetCompanyId},companyBId.eq.${myCompanyId})`
    )
    .limit(1)
    .single()

  if (existing) {
    const msg = existing.status === "PENDING" ? "すでに申請済みです" : "すでに紐づけ済みです"
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const { data: link, error } = await sb.from("CompanyLink").insert({
    id:                   randomBytes(12).toString("hex"),
    companyAId:           myCompanyId,
    companyBId:           targetCompanyId,
    status:               "PENDING",
    requestedByCompanyId: myCompanyId,
    updatedAt:            new Date().toISOString(),
  }).select().single()

  if (error) {
    console.error("[connections POST]", error)
    return NextResponse.json({ error: "申請に失敗しました" }, { status: 500 })
  }

  return NextResponse.json(link, { status: 201 })
}
