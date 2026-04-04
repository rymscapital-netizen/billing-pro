// GET /api/cron/reminder
// vercel.json: { "path": "/api/cron/reminder", "schedule": "0 9 * * *" }
// 毎日9時に実行: 7日前・前日・当日・超過の請求書に自動メール

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPaymentReminderEmail } from "@/lib/email"
import { differenceInCalendarDays, startOfDay, endOfDay, addDays } from "date-fns"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()

  // 通知対象: 7日前・前日・当日・超過（OVERDUE）の未払い請求書
  const targetDates = [
    startOfDay(addDays(today,  7)),  // 7日後が期限
    startOfDay(addDays(today,  1)),  // 明日が期限
    startOfDay(today),               // 今日が期限
  ]

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PENDING", "OVERDUE"] },
      OR: [
        // 指定日が期限の請求書
        ...targetDates.map((d) => ({
          dueDate: { gte: d, lte: endOfDay(d) },
        })),
        // 期限超過
        { status: "OVERDUE" },
      ],
    },
    include: {
      company: {
        include: {
          users: {
            where: { isActive: true, role: "CLIENT" },
            select: { email: true },
          },
        },
      },
    },
  })

  let sent = 0
  const errors: string[] = []

  for (const invoice of invoices) {
    const daysLeft = differenceInCalendarDays(new Date(invoice.dueDate), today)

    // 送信タイミング以外はスキップ（7日前・前日・当日・超過）
    if (daysLeft !== 7 && daysLeft !== 1 && daysLeft !== 0 && daysLeft >= 0) {
      continue
    }

    for (const user of invoice.company.users) {
      try {
        await sendPaymentReminderEmail({
          to:            user.email,
          clientName:    invoice.company.name,
          invoiceNumber: invoice.invoiceNumber,
          amount:        Number(invoice.amount),
          dueDate:       invoice.dueDate,
          daysLeft,
          portalUrl: `${process.env.NEXTAUTH_URL}/client/invoices`,
        })
        sent++
      } catch (e: any) {
        errors.push(`${invoice.invoiceNumber} → ${user.email}: ${e.message}`)
      }
    }
  }

  console.log(`[CRON/reminder] sent=${sent}, errors=${errors.length}`)

  return NextResponse.json({
    processed: invoices.length,
    sent,
    errors,
    processedAt: today.toISOString(),
  })
}
