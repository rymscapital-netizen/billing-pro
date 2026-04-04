import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { startOfMonth, endOfMonth, addMonths } from "date-fns"

// GET /api/invoices/export?filter=all&from=2024-01-01&to=2024-03-31
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get("filter") ?? "all"
  const from   = searchParams.get("from")
  const to     = searchParams.get("to")
  const now    = new Date()

  // フィルター条件
  let where: Record<string, unknown> = {}
  if (filter === "this_month") {
    where = { dueDate: { gte: startOfMonth(now), lte: endOfMonth(now) } }
  } else if (filter === "next_month") {
    const next = addMonths(now, 1)
    where = { dueDate: { gte: startOfMonth(next), lte: endOfMonth(next) } }
  } else if (filter === "overdue") {
    where = { status: "OVERDUE" }
  } else if (filter === "uncleared") {
    where = { payments: { some: { paymentStatus: "CONFIRMED", clearStatus: "UNCLEARED" } } }
  }
  if (from || to) {
    where = {
      dueDate: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to) }   : {}),
      },
    }
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      company: { select: { name: true } },
      profit:  true,
      payments: true,
    },
    orderBy: { dueDate: "asc" },
  })

  // BOM付きUTF-8でExcelが文字化けしないようにする
  const BOM = "\uFEFF"

  const headers = [
    "請求書番号",
    "取引先",
    "件名",
    "請求日",
    "支払期限",
    "小計",
    "消費税",
    "請求金額",
    "ステータス",
    "入金日",
    "入金額",
    "消込日",
    "売上",
    "原価",
    "粗利",
    "粗利率(%)",
    "備考",
  ]

  const STATUS_JP: Record<string, string> = {
    DRAFT:             "下書き",
    ISSUED:            "発行済",
    PENDING:           "支払待ち",
    OVERDUE:           "期限超過",
    PAYMENT_CONFIRMED: "支払確認済み",
    CLEARED:           "消込済み",
  }

  const fmt = (d: string | Date | null) =>
    d ? new Date(d).toLocaleDateString("ja-JP") : ""

  const rows = invoices.map((inv) => {
    const pay = inv.payments[0]
    return [
      inv.invoiceNumber,
      inv.company.name,
      inv.subject,
      fmt(inv.issueDate),
      fmt(inv.dueDate),
      Number(inv.subtotal),
      Number(inv.tax),
      Number(inv.amount),
      STATUS_JP[inv.status] ?? inv.status,
      fmt(pay?.paymentDate ?? null),
      pay?.paymentAmount ? Number(pay.paymentAmount) : "",
      fmt(pay?.clearedAt ?? null),
      inv.profit ? Number(inv.profit.sales)       : "",
      inv.profit ? Number(inv.profit.cost)        : "",
      inv.profit ? Number(inv.profit.grossProfit) : "",
      inv.profit ? Number(inv.profit.profitRate)  : "",
      inv.notes ?? "",
    ]
  })

  // CSV 生成（カンマを含むセルはクォート）
  const escape = (v: unknown) => {
    const s = String(v ?? "")
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const csv =
    BOM +
    [headers, ...rows]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")

  const filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
