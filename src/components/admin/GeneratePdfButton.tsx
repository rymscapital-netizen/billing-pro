"use client"

import { useState } from "react"
import { FileText } from "lucide-react"

interface Props {
  invoiceId: string
  onSuccess: () => void
}

export function GeneratePdfButton({ invoiceId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/generate-pdf`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("PDF生成に失敗しました")
      onSuccess()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="btn btn-outline-gold w-full justify-center gap-1.5"
    >
      <FileText size={13} />
      {loading ? "生成中..." : "PDFを自動生成"}
    </button>
  )
}
