import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
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

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  try {
    const sb = getSb()
    const { data: users, error } = await sb.from("User")
      .select("id, name, email, role, companyId, isActive, createdAt, updatedAt")
      .eq("companyId", u.companyId)
      .order("createdAt", { ascending: false })
    if (error) throw new Error(error.message)

    const { data: companies, error: companyError } = await sb.from("Company")
      .select("id, name")
      .eq("id", u.companyId)
      .limit(1)
    if (companyError) throw new Error(companyError.message)

    const company = companies?.[0] ?? null
    return NextResponse.json((users ?? []).map(user => ({ ...user, company })))
  } catch (e) {
    console.error("[users GET]", e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any
  const body = createSchema.parse(await req.json())

  if (u.role === "CLIENT" && body.companyId !== u.companyId) {
    return NextResponse.json({ error: "自社以外へのスタッフ登録はできません" }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } })
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスはすでに登録されています" }, { status: 409 })
  }

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
