"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PaymentModal } from "@/components/admin/PaymentModal"
import { ClearModal } from "@/components/admin/ClearModal"
import { ArrowLeft, ExternalLink, Trash2, Pencil, X, Check } from "lucide-react"
import Link from "next/link"
import { FileDropZone } from "@/components/shared/FileDropZone"

const yen  = (n: number) => `¥${Number(n).toLocaleString("ja-JP")}`
const date = (d: string) => new Date(d).toLocaleDateString("ja-JP")
const isoDate = (d: string) => new Date(d).toISOString().slice(0, 10)

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [inv, setInv]                   = useState<any>(null)
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [showPay, setShowPay]           = useState(false)
  const [showClr, setShowClr]           = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [rcvDetail, setRcvDetail]       = useState<any>(null)

  // 編集モード
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editForm, setEditForm]   = useState({
    subject:   "",
    issueDate: "",
    dueDate:   "",
    subtotal:  0,
    taxRate:   10,
    notes:     "",
  })

  const fetchInv = async () => {
    setLoading(true)
    const res = await fetch(`/api/invoices/${id}`)
    if (!res.ok) { router.push("/client/invoices"); return }
    const data = await res.json()
    setInv(data)
    if (data.pdfUrl) {
      const urlRes = await fetch(`/api/invoices/${id}/pdf-url`)
      if (urlRes.ok) {
        const { url } = await urlRes.json()
        setPdfSignedUrl(url)
      }
    } else {
      setPdfSignedUrl(null)
    }
    setLoading(false)
  }

  useEffect(() => { fetchInv() }, [id])

  const startEdit = () => {
    setEditForm({
      subject:   inv.subject,
      issueDate: isoDate(inv.issueDate),
      dueDate:   isoDate(inv.dueDate),
      subtotal:  Number(inv.subtotal),
      taxRate:   inv.subtotal > 0 ? Math.round((Number(inv.tax) / Number(inv.subtotal)) * 100) : 10,
      notes:     inv.notes ?? "",
    })
    setIsEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const tax = Math.round(editForm.subtotal * (editForm.taxRate / 100))
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:   editForm.subject,
        issueDate: editForm.issueDate,
        dueDate:   editForm.dueDate,
        subtotal:  editForm.subtotal,
        tax,
        notes:     editForm.notes,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setIsEditing(false)
      fetchInv()
    }
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    await fetch(`/api/invoices/${id}/upload-pdf`, { method: "POST", body: fd })
    setUploading(false)
    fetchInv()
  }

  const handleDelete = async () => {
    if (!confirm(`${inv.invoiceNumber} を削除しますか？`)) return
    await fetch(`/api/invoices/${id}`, { method: "DELETE" })
    router.push("/client/invoices")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-navy-400 text-[13px]">
        読み込み中...
      </div>
    )
  }
  if (!inv) return null

  const payment = inv.payments?.[0]
  const tax = isEditing
    ? Math.round(editForm.subtotal * (editForm.taxRate / 100))
    : Number(inv.tax)
  const total = isEditing ? editForm.subtotal + tax : Number(inv.amount)

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      <Link href="/client/invoices"
            className="inline-flex items-center gap-1.5 text-[12px] text-navy-400 hover:text-navy-700 transition-colors">
        <ArrowLeft size={13} />
        請求書一覧に戻る
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-navy-400 uppercase tracking-[0.06em] mb-1">請求書番号</p>
            <h1 className="text-[22px] font-medium text-navy-900 tabular">{inv.invoiceNumber}</h1>
            <p className="text-[13px] text-navy-500 mt-1">{inv.company.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={inv.status} role="CLIENT" />
            {!isEditing && (inv.status === "PENDING" || inv.status === "OVERDUE" || inv.status === "ISSUED") && (
              <button className="btn btn-outline-gold" onClick={() => setShowPay(true)}>
                着金確認
              </button>
            )}
            {!isEditing && inv.status === "PAYMENT_CONFIRMED" && (
              <button className="btn btn-navy" onClick={() => setShowClr(true)}>
                消込処理
              </button>
            )}
            {isEditing ? (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  <Check size={13} />{saving ? "保存中..." : "保存"}
                </button>
                <button onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-navy-200 text-navy-600 rounded-lg hover:bg-navy-50 transition-colors">
                  <X size={13} />キャンセル
                </button>
              </>
            ) : (
              <button onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-navy-200 text-navy-600 rounded-lg hover:bg-navy-50 transition-colors">
                <Pencil size={13} />編集
              </button>
            )}
            {!isEditing && (
              <button
                onClick={handleDelete}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="削除"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">

          {/* 基本情報 */}
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">基本情報</h2>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div className="col-span-2">
                  <label className="form-label">件名</label>
                  <input className="form-input" value={editForm.subject}
                    onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">請求日</label>
                  <input type="date" className="form-input" value={editForm.issueDate}
                    onChange={e => setEditForm(f => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">支払期限</label>
                  <input type="date" className="form-input" value={editForm.dueDate}
                    onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">請求先</label>
                  <div className="form-input bg-navy-50 text-navy-500 cursor-default">{inv.company.name}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                {[
                  ["件名",     inv.subject],
                  ["請求日",   date(inv.issueDate)],
                  ["支払期限", date(inv.dueDate)],
                  ["請求先",   inv.company.name],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.05em] mb-0.5">{label}</p>
                    <p className="text-navy-900 font-medium">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {(!isEditing && inv.notes) && (
              <div className="mt-4 pt-4 border-t border-navy-100">
                <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.05em] mb-1">備考</p>
                <p className="text-[13px] text-navy-700">{inv.notes}</p>
              </div>
            )}
            {isEditing && (
              <div className="mt-4">
                <label className="form-label">備考</label>
                <textarea className="form-input h-20 resize-none" value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            )}
          </div>

          {/* 金額 */}
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">金額</h2>
            {isEditing ? (
              <div className="space-y-3 text-[13px]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">小計</label>
                    <input type="number" className="form-input" value={editForm.subtotal}
                      onChange={e => setEditForm(f => ({ ...f, subtotal: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="form-label">消費税率</label>
                    <select className="form-input" value={editForm.taxRate}
                      onChange={e => setEditForm(f => ({ ...f, taxRate: Number(e.target.value) }))}>
                      <option value={10}>10%</option>
                      <option value={8}>8%（軽減）</option>
                      <option value={0}>0%（非課税）</option>
                    </select>
                  </div>
                </div>
                <div className="p-3 bg-navy-50 rounded-lg flex justify-between text-[13px] font-medium">
                  <span className="text-navy-600">消費税</span>
                  <span className="tabular">{yen(tax)}</span>
                </div>
                <div className="p-3 bg-navy-50 rounded-lg flex justify-between text-[15px] font-medium">
                  <span className="text-navy-900">請求金額合計</span>
                  <span className="tabular text-navy-900">{yen(total)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between text-navy-600">
                  <span>小計</span><span className="tabular">{yen(inv.subtotal)}</span>
                </div>
                <div className="flex justify-between text-navy-600">
                  <span>消費税（10%）</span><span className="tabular">{yen(inv.tax)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-navy-100 text-navy-900 font-medium text-[15px]">
                  <span>請求金額</span><span className="tabular">{yen(inv.amount)}</span>
                </div>
              </div>
            )}
          </div>

          {inv.profit && (
            <div className="card p-5">
              <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">利益情報</h2>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "売上",   value: yen(inv.profit.sales),       color: "" },
                  { label: "原価",   value: yen(inv.profit.cost),        color: "" },
                  { label: "粗利",   value: yen(inv.profit.grossProfit), color: "text-emerald-700" },
                  {
                    label: "粗利率",
                    value: `${Number(inv.profit.profitRate).toFixed(1)}%`,
                    color: Number(inv.profit.profitRate) >= 30 ? "text-emerald-700" : "text-amber-700",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-navy-50 rounded-lg p-3">
                    <p className="text-[10px] text-navy-400 uppercase tracking-[0.06em] mb-1">{label}</p>
                    <p className={`text-[15px] font-medium tabular ${color || "text-navy-900"}`}>{value}</p>
                  </div>
                ))}
              </div>

              {inv.linkedReceivedInvoices?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-navy-100">
                  <p className="text-[11px] text-navy-400 uppercase tracking-wider mb-2">
                    経費内訳（{inv.linkedReceivedInvoices.length}件）
                  </p>
                  <div className="space-y-1.5">
                    {inv.linkedReceivedInvoices.map((r: any) => {
                      const inc = Number(r.amount)
                      const ex  = Math.round(inc / 1.1)
                      return (
                        <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-navy-50 last:border-0">
                          <span className="text-navy-600 truncate max-w-[200px]">
                            {r.vendorName}｜{r.subject}
                          </span>
                          <button
                            onClick={() => setRcvDetail(r)}
                            className="tabular-nums text-blue-600 hover:text-blue-800 hover:underline font-medium ml-2 shrink-0"
                          >
                            {yen(ex)}<span className="text-navy-400 font-normal">（税抜）/ {yen(inc)}（税込）</span>
                          </button>
                        </div>
                      )
                    })}
                    {inv.linkedReceivedInvoices.length > 1 && (
                      <div className="flex justify-between text-[12px] pt-2 font-medium text-navy-800">
                        <span>合計（税抜）</span>
                        <span className="tabular-nums">
                          {yen(inv.linkedReceivedInvoices.reduce((s: number, r: any) => s + Math.round(Number(r.amount) / 1.1), 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">入金・消込状況</h2>
            {payment ? (
              <div className="space-y-3 text-[13px]">
                <Row label="入金ステータス" value={payment.paymentStatus === "CONFIRMED" ? "確認済み" : "未入金"} />
                {payment.paymentDate  && <Row label="入金日"  value={date(payment.paymentDate)} />}
                {payment.paymentAmount && <Row label="入金額" value={yen(payment.paymentAmount)} />}
                <div className="pt-2 border-t border-navy-100">
                  <Row label="消込ステータス" value={payment.clearStatus === "CLEARED" ? "消込済み" : "未消込"} />
                  {payment.clearedAt && <Row label="消込日" value={date(payment.clearedAt)} />}
                </div>
                {payment.notes && (
                  <div className="pt-2 border-t border-navy-100">
                    <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.05em] mb-1">備考</p>
                    <p className="text-navy-700">{payment.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-navy-400">未登録</p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">請求書 PDF</h2>
            {pdfSignedUrl ? (
              <div className="space-y-3">
                <iframe
                  src={pdfSignedUrl}
                  className="w-full rounded-lg border border-navy-100"
                  style={{ height: "500px" }}
                  title={`${inv.invoiceNumber}.pdf`}
                />
                <div className="flex gap-2">
                  <a href={pdfSignedUrl} target="_blank" rel="noreferrer"
                     className="btn btn-outline-gold flex-1 justify-center gap-1.5">
                    <ExternalLink size={12} />ファイルを開く
                  </a>
                </div>
                <FileDropZone
                  onFile={handleFileUpload}
                  loading={uploading}
                  label="差し替え（PDF / 画像）"
                  compact
                />
              </div>
            ) : (
              <FileDropZone
                onFile={handleFileUpload}
                loading={uploading}
              />
            )}
          </div>
        </div>
      </div>

      {showPay && (
        <PaymentModal invoice={inv} onClose={() => setShowPay(false)} onSuccess={() => { setShowPay(false); fetchInv() }} />
      )}
      {showClr && (
        <ClearModal invoice={inv} onClose={() => setShowClr(false)} onSuccess={() => { setShowClr(false); fetchInv() }} />
      )}

      {rcvDetail && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setRcvDetail(null)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[480px] shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-medium text-navy-900">被請求書 詳細</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  background: rcvDetail.status === "PAID" ? "#2e9e6218" : "#c4982818",
                  color:      rcvDetail.status === "PAID" ? "#2e9e62"   : "#c49828",
                }}>
                {rcvDetail.status === "PAID" ? "送金済み" : "未送金"}
              </span>
            </div>
            <div className="space-y-0 text-[13px]">
              {[
                rcvDetail.invoiceNumber && ["請求書番号", rcvDetail.invoiceNumber],
                ["取引先（請求元）", rcvDetail.vendorName],
                ["件名",           rcvDetail.subject],
                ["請求日",         date(String(rcvDetail.issueDate))],
                ["支払期限",       date(String(rcvDetail.dueDate))],
                ["金額（税込）",   yen(Number(rcvDetail.amount))],
                ["税抜金額",       yen(Math.round(Number(rcvDetail.amount) / 1.1))],
                rcvDetail.paidAt && ["送金日", date(String(rcvDetail.paidAt))],
              ].filter(Boolean).map(([label, value]: any) => (
                <div key={label} className="flex justify-between py-2 border-b border-navy-50 last:border-0">
                  <span className="text-navy-400">{label}</span>
                  <span className="font-medium text-navy-900 text-right max-w-[260px]">{value}</span>
                </div>
              ))}
              {rcvDetail.notes && (
                <div className="pt-3">
                  <p className="text-navy-400 text-[11px] mb-1">備考</p>
                  <p className="text-navy-700 bg-navy-50 rounded-lg px-3 py-2 text-[12px]">{rcvDetail.notes}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-5 pt-4 border-t border-navy-100">
              <button onClick={() => setRcvDetail(null)}
                className="px-5 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-navy-400 text-[12px]">{label}</span>
      <span className="text-navy-900 font-medium text-[12px] tabular">{value}</span>
    </div>
  )
}
