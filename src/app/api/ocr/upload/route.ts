import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }

  // Base64変換
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")

  // OcrJobを作成
  const job = await prisma.ocrJob.create({
    data: {
      originalFileUrl: file.name,
      status: "PROCESSING",
      createdByUserId: session.user.id,
    },
  })

  try {
    // Claude Vision で OCR
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: `この請求書PDFから以下の項目をJSON形式で抽出してください。
各項目に信頼度(0.0〜1.0)も付けてください。
JSONのみを返し、説明文は不要です。

{
  "invoiceNumber":   { "value": "INV-001", "confidence": 0.95 },
  "issueDate":       { "value": "2024-01-31", "confidence": 0.9 },
  "dueDate":         { "value": "2024-03-31", "confidence": 0.85 },
  "companyName":     { "value": "株式会社〇〇", "confidence": 0.8 },
  "subject":         { "value": "システム開発費", "confidence": 0.9 },
  "subtotal":        { "value": 1000000, "confidence": 0.95 },
  "tax":             { "value": 100000, "confidence": 0.95 },
  "amount":          { "value": 1100000, "confidence": 0.95 }
}`,
          },
        ],
      }],
    })

    const raw = (message.content[0] as any).text
    let extracted: Record<string, { value: unknown; confidence: number }> = {}

    try {
      extracted = JSON.parse(raw.replace(/```json|```/g, "").trim())
    } catch {
      throw new Error("OCR parse failed")
    }

    // 結果を保存
    await prisma.ocrJob.update({
      where: { id: job.id },
      data: {
        extractedJson: extracted,
        status: "REVIEW",
      },
    })

    return NextResponse.json({ jobId: job.id, extracted })

  } catch (error: any) {
    await prisma.ocrJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    })
    return NextResponse.json(
      { error: error.message || "OCR failed" },
      { status: 500 }
    )
  }
}