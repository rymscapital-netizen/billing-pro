import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  name:            z.string().min(1).optional(),
  email:           z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(6).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "入力内容が正しくありません" }, { status: 400 })
  }

  // パスワード変更する場合は現在のパスワード必須
  if (body.newPassword) {
    if (!body.currentPassword)
      return NextResponse.json({ error: "現在のパスワードを入力してください" }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: u.id } })
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!ok)
      return NextResponse.json({ error: "現在のパスワードが正しくありません" }, { status: 400 })
  }

  // メールアドレス変更時の重複チェック
  if (body.email && body.email !== u.email) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing)
      return NextResponse.json({ error: "このメールアドレスはすでに使用されています" }, { status: 409 })
  }

  const data: any = {}
  if (body.name)        data.name         = body.name
  if (body.email)       data.email        = body.email
  if (body.newPassword) data.passwordHash = await bcrypt.hash(body.newPassword, 12)

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "変更内容がありません" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: u.id },
    data,
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({ ok: true, user: updated })
}
