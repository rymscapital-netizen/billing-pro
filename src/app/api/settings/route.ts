import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  name:        z.string().min(1),
  address:     z.string().optional(),
  tel:         z.string().optional(),
  email:       z.string().optional(),
  contactName: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const company = await prisma.company.findFirst({
      where: { type: "ADMIN" },
    })
    if (!company) return NextResponse.json({})
    return NextResponse.json(company)
  } catch (e) {
    console.error(e)
    return NextResponse.json({})
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = schema.parse(await req.json())
    await prisma.company.updateMany({
      where: { type: "ADMIN" },
      data: {
        name:        body.name,
        address:     body.address,
        tel:         body.tel,
        email:       body.email,
        contactName: body.contactName,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
