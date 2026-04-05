import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
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

    const sb = getSb()
    let q = sb.from("ReceivedInvoice")
      .select("*, assignedUser:User!assignedUserId(id,name)")
      .eq("ownerCompanyId", u.companyId)
      .order("dueDate", { ascending: true })

    if (filterUserId) q = q.eq("assignedUserId", filterUserId)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      assignedUser:     Array.isArray(r.assignedUser) ? (r.assignedUser[0] ?? null) : r.assignedUser,
      assignedUserName: Array.isArray(r.assignedUser) ? r.assignedUser[0]?.name : r.assignedUser?.name,
    }))
    return NextResponse.json(rows)
  } catch (e: any) {
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
    const sb = getSb()
    const id  = crypto.randomUUID()
    const now = new Date().toISOString()

    const { data, error } = await sb.from("ReceivedInvoice").insert({
      id,
      invoiceNumber:  body.invoiceNumber  ?? null,
      vendorName:     body.vendorName,
      subject:        body.subject,
      issueDate:      new Date(body.issueDate).toISOString(),
      dueDate:        new Date(body.dueDate).toISOString(),
      amount:         body.amount,
      status:         "UNPAID",
      notes:          body.notes          ?? null,
      assignedUserId: body.assignedUserId ?? null,
      ownerCompanyId: u.companyId,
      createdAt:      now,
      updatedAt:      now,
    }).select().single()

    if (error) throw new Error(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    console.error("[received-invoices POST]", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
