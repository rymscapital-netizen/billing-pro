import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const targetUserSchema = z.object({
  userId: z.string().min(1),
  targetGrossProfitShare: z.number().min(0).max(100),
  targetCommissionAmount: z.number().min(0),
})

const schema = z.object({
  annualGrossProfitTarget: z.number().min(0).max(99999999999999).optional(),
  users: z.array(targetUserSchema).optional(),
})

function canManageAllTargets(user: any) {
  return String(user?.name ?? "").includes("浪田")
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const currentUser = session.user as any
  const body = schema.parse(await req.json())
  const canManageAll = canManageAllTargets(currentUser)

  if (body.annualGrossProfitTarget !== undefined) {
    if (!canManageAll) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    await (prisma.company.updateMany as any)({
      where: { id: currentUser.companyId, type: "ADMIN" },
      data: { annualGrossProfitTarget: body.annualGrossProfitTarget },
    })
  }

  for (const row of body.users ?? []) {
    if (!canManageAll && row.userId !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    await (prisma.user.updateMany as any)({
      where: {
        id: row.userId,
        companyId: currentUser.companyId,
        role: "ADMIN",
      },
      data: {
        targetGrossProfitShare: row.targetGrossProfitShare,
        targetCommissionAmount: row.targetCommissionAmount,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
