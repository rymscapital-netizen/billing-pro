import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const adminCo = await prisma.company.upsert({
    where: { id: "admin-co" },
    update: {},
    create: { id: "admin-co", name: "株式会社BillingPro", type: "ADMIN" },
  })

  await prisma.user.upsert({
    where: { email: "admin@billing.pro" },
    update: {},
    create: {
      companyId: adminCo.id,
      name: "山田 太郎",
      email: "admin@billing.pro",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "ADMIN",
    },
  })

  const clientCo = await prisma.company.upsert({
    where: { id: "sample-co" },
    update: {},
    create: { id: "sample-co", name: "株式会社サンプル商事", type: "CLIENT" },
  })

  await prisma.user.upsert({
    where: { email: "tanaka@sample.co.jp" },
    update: {},
    create: {
      companyId: clientCo.id,
      name: "田中 一郎",
      email: "tanaka@sample.co.jp",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "CLIENT",
    },
  })

  await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2024-001",
      companyId: clientCo.id,
      subject: "Webシステム開発",
      issueDate: new Date("2024-01-31"),
      dueDate: new Date("2024-03-31"),
      subtotal: 800000,
      tax: 80000,
      amount: 880000,
      status: "PENDING",
      profit: {
        create: { sales: 800000, cost: 550000, grossProfit: 250000, profitRate: 31.25 }
      },
      payments: {
        create: { paymentStatus: "UNPAID", clearStatus: "UNCLEARED" }
      },
    },
  })

  console.log("✅ Seed complete")
}

main().catch(console.error).finally(() => prisma.$disconnect())