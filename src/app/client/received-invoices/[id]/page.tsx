"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, FileText } from "lucide-react"

const yen  = (n: number) => `¥${Number(n).toLocaleString("ja-JP")}`
const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("ja-JP") : "—"

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  UNPAID: { label: "未送金",   bg: "#fefce8", color: "#c49828" },
  PAID:   { label: "送金済み", bg: "#f0fdf4", color: "#2e9e62" },
}

export default function ReceivedInvoiceDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [inv, setInv]               = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [sendDate, setSendDate]     = useState(new Date().toISOString().slice(0, 10))
  const [showPayModal, setShowPayModal] = useState(false)

  const fetchInv = async () => {
    setLoading(true)
    const res = await fetch(`/api/received-invoices/${id}`)
    if (!res.ok) { router.push("/client/invoices?tab=received"); return }
    const data = await res.json()
    setInv(data)

    if (data.pdfUrl) {
      const urlRes = await fetch(`/api/received-invoices/${id}/pdf-url`)
      if (urlRes.ok) {
        const { url } = await urlRes.json()
        setPdfUrl(url)
      }
    }
    setLoading(false)
  }

  useEffect(() => { fetchInv() }, [id])

  const handleConfirmPayment = async () => {
    if (!inv) return
    setProcessing(true)
    await fetch(`/api/received-invoices/${id}/confirm-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidAt: sendDate }),
    })
    setShowPayModal(false)
    setProcessing(false)
    fetchInv()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-navy-400 text-[13px]">
        読み込み中...
      </div>
    )
  }
  if (!inv) return null

  const status = STATUS[inv.status] ?? { label: inv.status, bg: "#f7f9fc", color: "#8a9ab8" }
  const isOverdue = inv.status === "UNPAID" && new Date(inv.dueDate) < new Date()

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/client/invoices")}
          className="btn btn-icon text-navy-400 border-transparent"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h2 className="text-[14px] font-medium text-navy-900">被請求書詳細</h2>
          <p className="text-[11px] text-navy-400 mt-0.5">{inv.invoiceNumber ?? "—"}</p>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: status.bg, color: status.color }}
        >
          {isOverdue ? "期限超過" : status.label}
        </span>
      </div>

      {/* 基本情報 */}
      <div className="card p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">基本情報</h3>
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div>
            <p className="text-[11px] text-navy-400 mb-1">取引先（請求元）</p>
            <p className="font-medium text-navy-900">{inv.vendorName}</p>
          </div>
          <div>
            <p className="text-[11px] text-navy-400 mb-1">件名</p>
            <p className="text-navy-900">{inv.subject}</p>
          </div>
          <div>
            <p className="text-[11px] text-navy-400 mb-1">請求日</p>
            <p className="text-navy-900">{date(inv.issueDate)}</p>
          </div>
          <div>
            <p className="text-[11px] text-navy-400 mb-1">支払期限</p>
            <p className={`font-medium ${isOverdue ? "text-red-600" : "text-navy-900"}`}>
              {date(inv.dueDate)}
              {isOverdue && <span className="ml-2 text-[10px] text-red-500">期限超過</span>}
            </p>
          </div>
          {inv.assignedUser && (
            <div>
              <p className="text-[11px] text-navy-400 mb-1">担当者</p>
              <p className="text-navy-900">{inv.assignedUser.name}</p>
            </div>
          )}
          {inv.notes && (
            <div className="col-span-2">
              <p className="text-[11px] text-navy-400 mb-1">備考</p>
              <p className="text-navy-700 whitespace-pre-wrap text-[12px]">{inv.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* 金額 */}
      <div className="card p-5">
        <h3 className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-4">金額</h3>
        <div className="flex items-end justify-between">
          <p className="text-[12px] text-navy-400">請求金額（税込）</p>
          <p className="text-[28px] font-bold text-navy-900">{yen(inv.amount)}</p>
        </div>
        {inv.status === "PAID" && inv.paymentDate && (
          <p className="text-[11px] text-emerald-600 mt-2">
            送金確認日: {date(inv.paymentDate)}
          </p>
        )}
      </div>

      {/* PDF */}
      {pdfUrl && (
        <div className="card p-5">
          <h3 className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">添付PDF</h3>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn gap-2 text-[12px]"
          >
            <FileText size={13} />
            PDFを開く
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {/* 送金確認ボタン */}
      {inv.status === "UNPAID" && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowPayModal(true)}
            className="btn gap-1.5 bg-blue-600 text-white border-blue-600 hover:bg-blue-700 text-[13px]"
          >
            送金確認
          </button>
        </div>
      )}

      {/* 送金確認モーダル */}
      {showPayModal && (
        <div
          className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowPayModal(false)}
        >
          <div className="modal animate-fade-in" style={{ maxWidth: "400px" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="modal-bar" />
              <h2 className="text-[15px] font-medium text-navy-900 flex-1">送金確認</h2>
            </div>
            <div className="space-y-4">
              <div className="bg-navy-50 rounded-lg px-4 py-3 text-[13px]">
                <p className="text-[11px] text-navy-400 mb-1">請求書</p>
                <p className="font-medium text-navy-900">{inv.subject}</p>
                <p className="text-navy-700 mt-1">{yen(inv.amount)}</p>
              </div>
              <div>
                <label className="form-label">送金日</label>
                <input
                  type="date"
                  className="form-input"
                  value={sendDate}
                  onChange={e => setSendDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-navy-100">
              <button onClick={() => setShowPayModal(false)} className="btn">キャンセル</button>
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="btn bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {processing ? "処理中..." : "送金確認する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
