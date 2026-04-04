import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function esc(s: string | null | undefined): string {
  if (s == null) return "NULL"
  return `'${String(s).replace(/'/g, "''")}'`
}

const createSchema = z.object({
  invoiceNumber:  z.string().optional(),
  vendorName:     z.string().min(1),
  subject:        z.string().min(1),
  issueDate:      z.string(),
  dueDate:        z.string(),
  amount:         z.number().positive(),
  notes:          z.string().optional(),
  assignedUserId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const u = session.user as any

    const { searchParams } = new URL(req.url)
    const filterUserId = searchParams.get("assignedUserId")

    let sql = `SELECT ri.*, u.name AS "assignedUserName"
               FROM "ReceivedInvoice" ri
               LEFT JOIN "User" u ON u.id = ri."assignedUserId"`
    const conditions: string[] = []

    // 取引先は自社の被請求書のみ表示
    if (u.role === "CLIENT") {
      conditions.push(`ri."ownerCompanyId" = ${esc(u.companyId)}`)
    }
    if (filterUserId) conditions.push(`ri."assignedUserId" = ${esc(filterUserId)}`)
    if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`
    sql += ` ORDER BY ri."dueDate" ASC`

    const invoices: any[] = await prisma.$queryRawUnsafe(sql)
    return NextResponse.json(invoices)
  } catch (e) {
    console.error("[received-invoices GET]", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const u = session.user as any

    const body = createSchema.parse(await req.json())
    const newId = "c" + Math.random().toString(36).slice(2, 27)

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ReceivedInvoice"
         (id, "invoiceNumber", "vendorName", subject, "issueDate", "dueDate", amount, status, notes, "assignedUserId", "ownerCompanyId", "createdAt", "updatedAt")
       VALUES (
         '${newId}',
         ${esc(body.invoiceNumber ?? null)},
         ${esc(body.vendorName)},
         ${esc(body.subject)},
         '${new Date(body.issueDate).toISOString()}',
         '${new Date(body.dueDate).toISOString()}',
         ${body.amount},
         'UNPAID',
         ${esc(body.notes ?? null)},
         ${esc((body as any).assignedUserId ?? null)},
         ${esc(u.companyId)},
         NOW(), NOW()
       )`
    )

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "ReceivedInvoice" WHERE id = '${newId}'`
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    console.error("[received-invoices POST]", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
