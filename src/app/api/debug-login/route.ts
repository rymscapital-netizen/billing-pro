import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export async function GET() {
  const results: Record<string, any> = {}

  // 1. DB接続確認
  try {
    const user = await prisma.user.findUnique({
      where: { email: "namita@souou-estate.com" },
      include: { company: true },
    })
    if (user) {
      results.user_found = true
      results.user_name = user.name
      results.user_role = user.role
      results.user_isActive = user.isActive
      results.company_found = !!user.company
      results.company_name = user.company?.name
      results.hash_exists = !!user.passwordHash
      // パスワード確認
      const ok = await bcrypt.compare("souou117117", user.passwordHash)
      results.password_match = ok
    } else {
      results.user_found = false
    }
  } catch (e: any) {
    results.db_error = e.message
  }

  // 2. 環境変数確認
  results.env = {
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    NEXTAUTH_SECRET_set: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  }

  return NextResponse.json(results)
}
