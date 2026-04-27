import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.FREEE_CLIENT_ID!,
    redirect_uri: process.env.FREEE_REDIRECT_URI!,
    prompt: "select_company",
  })
  const url = `https://accounts.secure.freee.co.jp/public_api/authorize?${params}`
  return NextResponse.redirect(url)
}
