import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

const createSchema = z.object({
  name:      z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(6),
  role:      z.enum(["ADMIN", "CLIENT"]),
  companyId: z.string().min(1),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  try {
    // ロール問わず自社ユーザーのみ返す（テナント分離）
    const where = { companyId: u.companyId }
    const users = await prisma.user.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(users)
  } catch (e) {
    console.error(e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any
  const body = createSchema.parse(await req.json())

  // CLIENT は自社スタッフのみ登録可（companyId は自社固定、role は CLIENT 固定）
  if (u.role === "CLIENT") {
    if (body.companyId !== u.companyId)
      return NextResponse.json({ error: "自社以外へのスタッフ登録はできません" }, { status: 403 })
  }

  // メールアドレス重複チェック
  const existing = await prisma.user.findUnique({ where: { email: body.email } })
  if (existing)
    return NextResponse.json({ error: "このメールアドレスはすでに登録されています" }, { status: 409 })

  const passwordHash = await bcrypt.hash(body.password, 12)
  const role = u.role === "CLIENT" ? "CLIENT" : body.role

  const user = await prisma.user.create({
    data: {
      name:         body.name,
      email:        body.email,
      passwordHash,
      role,
      companyId:    body.companyId,
    },
    include: { company: { select: { id: true, name: true } } },
  })
  return NextResponse.json(user, { status: 201 })
}
