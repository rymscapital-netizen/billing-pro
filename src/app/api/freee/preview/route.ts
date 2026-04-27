import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  const accessToken = req.cookies.get("freee_access_token")?.value
  const companyId   = req.cookies.get("freee_company_id")?.value

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: "freee未連携" }, { status: 401 })
  }

  const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
  const freeeRes = await fetch(`https://api.freee.co.jp/api/1/invoices?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!freeeRes.ok) {
    return NextResponse.json({ error: "freee APIエラー" }, { status: 502 })
  }

  const { invoices } = await freeeRes.json()
  if (!Array.isArray(invoices)) {
    return NextResponse.json({ error: "データなし" }, { status: 502 })
  }

  const result = invoices.map((fi: any) => ({
    freeeId:       String(fi.id),
    invoiceNumber: fi.invoice_number || `FREEE-${fi.id}`,
    partnerName:   fi.partner_name   || "不明",
    title:         fi.title          || "（タイトルなし）",
    invoiceDate:   fi.invoice_date   || null,
    dueDate:       fi.due_date       || null,
    totalAmount:   fi.total_amount   ?? 0,
    status:        fi.invoice_status ?? "draft",
  }))

  return NextResponse.json(result)
}
