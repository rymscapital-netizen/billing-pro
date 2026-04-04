"use client"

import { useState } from "react"
import { Download } from "lucide-react"

interface ExportButtonProps {
  filter?: string
  from?: string
  to?: string
}

export function ExportButton({ filter = "all", from, to }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ filter })
      if (from) params.set("from", from)
      if (to)   params.set("to",   to)

      const res = await fetch(`/api/invoices/export?${params}`)
      if (!res.ok) throw new Error("Export failed")

      // ブラウザでダウンロード
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="btn btn-outline-gold gap-1.5"
    >
      <Download size={13} />
      {loading ? "出力中..." : "CSV 出力"}
    </button>
  )
}
