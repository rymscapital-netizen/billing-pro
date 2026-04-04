import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const hash = await bcrypt.hash("password123", 12)

await prisma.user.update({
  where: { email: "admin@billing.pro" },
  data: { passwordHash: hash },
})

await prisma.user.update({
  where: { email: "tanaka@sample.co.jp" },
  data: { passwordHash: hash },
})

console.log("✅ パスワードを更新しました")
await prisma.$disconnect()