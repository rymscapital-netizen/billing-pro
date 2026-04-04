import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

// POST /api/connections/lookup
// 会社名（完全一致）＋その会社に属するメールアドレス（完全一致）が両方一致した場合のみ会社IDを返す
// 一覧・予測候補は一切返さない
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const myCompanyId = (session.user as any).companyId

  const { companyName, email } = await req.json()
  if (!companyName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "会社名とメールアドレスを入力してください" }, { status: 400 })
  }

  // 会社名完全一致（大文字小文字無視）かつ、そのメールアドレスのユーザーがその会社に存在する
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email.trim(), mode: "insensitive" },
      company: { name: { equals: companyName.trim(), mode: "insensitive" }, isActive: true },
    },
    select: { companyId: true, company: { select: { id: true, name: true } } },
  })

  if (!user) {
    // 一致しない場合は「見つかりません」のみ返す（会社の存在有無を漏らさない）
    return NextResponse.json({ error: "会社名とメールアドレスが一致する企業が見つかりませんでした" }, { status: 404 })
  }

  if (user.companyId === myCompanyId) {
    return NextResponse.json({ error: "自社への申請はできません" }, { status: 400 })
  }

  return NextResponse.json({ companyId: user.company!.id, companyName: user.company!.name })
}
