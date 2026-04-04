// src/app/api/cron/overdue/route.ts
// Vercel Cron / 外部cronから叩く: GET /api/cron/overdue
// vercel.json に {"crons":[{"path":"/api/cron/overdue","schedule":"0 1 * * *"}]} を追加

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  // cronシークレットで保護
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // 期限を過ぎた PENDING 請求書を OVERDUE に更新
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ["ISSUED", "PENDING"] },
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  })

  console.log(`[CRON] Overdue update: ${result.count} invoices marked as OVERDUE`)

  return NextResponse.json({
    updated: result.count,
    processedAt: now.toISOString(),
  })
}
