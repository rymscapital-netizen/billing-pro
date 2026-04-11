"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PaymentModal } from "@/components/admin/PaymentModal"
import { ClearModal } from "@/components/admin/ClearModal"
import { ArrowLeft, ExternalLink, Trash2, Pencil, X, Check, ScanText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { FileDropZone } from "@/components/shared/FileDropZone"

const yen      = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`
const dateStr  = (d: string) => new Date(d).toLocaleDateString("ja-JP")
const isoDate  = (d: string) => new Date(d).toISOString().slice(0, 10)

// 税込/税抜 計算
type TaxBreakdown = { ex: number; inc: number; taxRate: number }
const calcEx  = (inc: number, rate: number) => Math.floor(inc / (1 + rate / 100))
const calcInc = (ex: number, rate: number)  => Math.round(ex * (1 + rate / 100))
const taxAmt  = (b: TaxBreakdown) => b.inc - b.ex

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
  const [allUsers, setAllUsers]         = useState<{ id: string; name: string }[]>([])

  // 編集モード
  const [isEditing, setIsEditing]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [editForm, setEditForm]     = useState({
    subject: "", issueDate: "", dueDate: "", subtotal: 0, taxRate: 10, notes: "", assignedUserId: "",
  })

  // 利益情報（税込/税抜 3カード）
  const [salesBreak, setSalesBreak] = useState<TaxBreakdown>({ ex: 0, inc: 0, taxRate: 10 })
  const [costBreak,  setCostBreak]  = useState<TaxBreakdown>({ ex: 0, inc: 0, taxRate: 10 })

  // OCR
  const [ocrLoading, setOcrLoading]   = useState(false)
  const [ocrError,   setOcrError]     = useState("")
  const [ocrFields,  setOcrFields]    = useState<Set<string>>(new Set())
  const [ocrDragging, setOcrDragging] = useState(false)
  const ocrInputRef = useRef<HTMLInputElement>(null)

  // 被請求書 linking
  const [availableRcv, setAvailableRcv] = useState<any[]>([])   // unlinked RCV list
  const [linkedRcvList, setLinkedRcvList] = useState<any[]>([]) // currently linked in edit
  const [origLinkedIds, setOrigLinkedIds] = useState<string[]>([]) // before edit started
  const [addingRcvId, setAddingRcvId]   = useState("")
  const [showNewRcv, setShowNewRcv]     = useState(false)
  const [newRcvSaving, setNewRcvSaving] = useState(false)
  const [rcvPdfFile, setRcvPdfFile]     = useState<File | null>(null)
  const [newRcv, setNewRcv] = useState({
    vendorName: "", subject: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    amount: "", taxRate: 10, notes: "", assignedUserId: "",
  })

  // 商品画像
  const [productImages, setProductImages] = useState<File[]>([])
  const [productImagePreviews, setProductImagePreviews] = useState<string[]>([])
  const [imgDragging, setImgDragging] = useState(false)

  // ─── 初期データ取得 ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/users").then(r => r.ok ? r.json() : [])
      .then((users: any[]) => setAllUsers(users.map((u: any) => ({ id: u.id, name: u.name }))))
  }, [])

  const fetchInv = async () => {
    setLoading(true)
    const res = await fetch(`/api/invoices/${id}`)
    if (!res.ok) { router.push("/admin/invoices"); return }
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

  // ─── 編集開始 ────────────────────────────────────────────────
  const startEdit = async () => {
    const taxRateVal = inv.subtotal > 0 ? Math.round((Number(inv.tax) / Number(inv.subtotal)) * 100) : 10
    setEditForm({
      subject:        inv.subject,
      issueDate:      isoDate(inv.issueDate),
      dueDate:        isoDate(inv.dueDate),
      subtotal:       Number(inv.subtotal),
      taxRate:        taxRateVal,
      notes:          inv.notes ?? "",
      assignedUserId: inv.assignedUser?.id ?? "",
    })

    // 利益情報の初期値
    const p = inv.profit
    const sEx  = p?.sales != null ? Number(p.sales) : Number(inv.subtotal)
    const sTr  = 10
    const cEx  = p?.cost  != null ? Number(p.cost)  : 0
    const cTr  = 10
    setSalesBreak({ ex: sEx, inc: calcInc(sEx, sTr), taxRate: sTr })
    setCostBreak ({ ex: cEx, inc: calcInc(cEx, cTr), taxRate: cTr })

    // 被請求書: 紐付き済みリスト
    const linked = inv.linkedReceivedInvoices ?? []
    setLinkedRcvList(linked)
    setOrigLinkedIds(linked.map((r: any) => r.id))

    // 未紐付けの被請求書を取得（invoiceId が null のもの）
    const rcvRes = await fetch("/api/received-invoices")
    if (rcvRes.ok) {
      const all = await rcvRes.json()
      const linkedIds = new Set(linked.map((r: any) => r.id))
      setAvailableRcv(all.filter((r: any) => !r.invoiceId || linkedIds.has(r.id)))
    }

    setProductImages([])
    setProductImagePreviews([])
    setOcrFields(new Set())
    setOcrError("")
    setIsEditing(true)
  }

  // ─── 保存 ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    const tax = Math.round(editForm.subtotal * (editForm.taxRate / 100))

    // 1. 請求書本体 + 利益情報 PATCH
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject:        editForm.subject,
        issueDate:      editForm.issueDate,
        dueDate:        editForm.dueDate,
        subtotal:       editForm.subtotal,
        tax,
        notes:          editForm.notes,
        assignedUserId: editForm.assignedUserId,
        sales:          salesBreak.ex,
        cost:           costBreak.ex,
      }),
    })

    // 2. 被請求書リンク変更
    const currentIds = new Set(linkedRcvList.map((r: any) => r.id))
    const origIds    = new Set(origLinkedIds)
    const toLink     = [...currentIds].filter(rid => !origIds.has(rid))
    const toUnlink   = [...origIds].filter(rid => !currentIds.has(rid))
    await Promise.all([
      ...toLink.map(rid => fetch(`/api/received-invoices/${rid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: id }),
      })),
      ...toUnlink.map(rid => fetch(`/api/received-invoices/${rid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: null }),
      })),
    ])

    // 3. 商品画像アップロード
    if (productImages.length > 0) {
      const fd = new FormData()
      productImages.forEach(f => fd.append("files", f))
      await fetch(`/api/invoices/${id}/upload-images`, { method: "POST", body: fd })
    }

    setSaving(false)
    setIsEditing(false)
    fetchInv()
  }

  // ─── OCR ────────────────────────────────────────────────────
  const handleOcrFile = async (file: File) => {
    setOcrLoading(true); setOcrError(""); setOcrFields(new Set())
    try {
      const fd = new FormData(); fd.append("file", file)
      const res  = await fetch("/api/ocr/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "OCR処理に失敗しました")
      const e = data.extracted
      const filled = new Set<string>()
      if (e.subject?.value)    { setEditForm(f => ({ ...f, subject:   e.subject.value }));   filled.add("subject") }
      if (e.issueDate?.value)  { setEditForm(f => ({ ...f, issueDate: e.issueDate.value }));  filled.add("issueDate") }
      if (e.dueDate?.value)    { setEditForm(f => ({ ...f, dueDate:   e.dueDate.value }));    filled.add("dueDate") }
      if (e.subtotal?.value != null) {
        const sub = Math.round(e.subtotal.value)
        setEditForm(f => ({ ...f, subtotal: sub }))
        setSalesBreak(prev => ({ ...prev, ex: sub, inc: calcInc(sub, prev.taxRate) }))
        filled.add("subtotal")
      }
      if (e.taxRate?.value != null) { setEditForm(f => ({ ...f, taxRate: e.taxRate.value })); filled.add("taxRate") }
      setOcrFields(filled)
    } catch (e: any) {
      setOcrError(e.message ?? "OCR処理に失敗しました")
    } finally {
      setOcrLoading(false)
    }
  }

  // ─── 被請求書 helpers ────────────────────────────────────────
  const updateSalesField = (patch: Partial<TaxBreakdown> & { incChanged?: boolean }) => {
    setSalesBreak(prev => {
      const next = { ...prev, ...patch }
      if (patch.incChanged) next.ex = calcEx(next.inc, next.taxRate)
      else if (patch.taxRate !== undefined || patch.ex !== undefined) next.inc = calcInc(next.ex, next.taxRate)
      return next
    })
  }
  const updateCostField = (patch: Partial<TaxBreakdown> & { incChanged?: boolean }) => {
    setCostBreak(prev => {
      const next = { ...prev, ...patch }
      if (patch.incChanged) next.ex = calcEx(next.inc, next.taxRate)
      else if (patch.taxRate !== undefined || patch.ex !== undefined) next.inc = calcInc(next.ex, next.taxRate)
      return next
    })
  }

  const selectedTotal = { inc: linkedRcvList.reduce((s, r) => s + Number(r.amount), 0) }
  const totalRcvInc  = selectedTotal.inc
  const totalRcvEx   = Math.round(totalRcvInc / 1.1)

  const applyRcvCost = (useInclusive: boolean) => {
    if (useInclusive) {
      const ex = Math.round(totalRcvInc / (1 + costBreak.taxRate / 100))
      setCostBreak(prev => ({ ...prev, ex, inc: totalRcvInc }))
    } else {
      updateCostField({ ex: totalRcvEx })
    }
  }

  const addRcvToLinked = () => {
    if (!addingRcvId) return
    const rcv = availableRcv.find(r => r.id === addingRcvId)
    if (rcv && !linkedRcvList.find(r => r.id === addingRcvId)) {
      setLinkedRcvList(prev => [...prev, rcv])
    }
    setAddingRcvId("")
  }
  const removeRcvFromLinked = (rid: string) => setLinkedRcvList(prev => prev.filter(r => r.id !== rid))

  const handleCreateRcv = async () => {
    if (!newRcv.vendorName.trim() || !newRcv.subject.trim() || !newRcv.amount) return
    setNewRcvSaving(true)
    try {
      const res = await fetch("/api/received-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: newRcv.vendorName.trim(), subject: newRcv.subject.trim(),
          issueDate: newRcv.issueDate, dueDate: newRcv.dueDate,
          amount: Number(newRcv.amount), notes: newRcv.notes || undefined,
          assignedUserId: newRcv.assignedUserId || undefined,
        }),
      })
      if (!res.ok) throw new Error("作成失敗")
      const created = await res.json()
      if (rcvPdfFile) {
        const fd = new FormData(); fd.append("file", rcvPdfFile)
        await fetch(`/api/received-invoices/${created.id}/upload-pdf`, { method: "POST", body: fd })
      }
      setAvailableRcv(prev => [...prev, created])
      setLinkedRcvList(prev => [...prev, created])
      setNewRcv({ vendorName: "", subject: "", issueDate: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), amount: "", taxRate: 10, notes: "", assignedUserId: "" })
      setRcvPdfFile(null); setShowNewRcv(false)
    } catch (e) { console.error(e) } finally { setNewRcvSaving(false) }
  }

  // ─── 商品画像 helpers ────────────────────────────────────────
  const addImageFiles = (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
    setProductImages(prev => [...prev, ...imgs])
    imgs.forEach(file => {
      const reader = new FileReader()
      reader.onload = e => setProductImagePreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(file)
    })
  }
  const removeProductImage = (i: number) => {
    setProductImages(prev => prev.filter((_, idx) => idx !== i))
    setProductImagePreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  // ─── PDF ────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploading(true)
    const fd = new FormData(); fd.append("file", file)
    await fetch(`/api/invoices/${id}/upload-pdf`, { method: "POST", body: fd })
    setUploading(false); fetchInv()
  }

  const handleDelete = async () => {
    if (!confirm(`${inv.invoiceNumber} を削除しますか？`)) return
    await fetch(`/api/invoices/${id}`, { method: "DELETE" })
    router.push("/admin/invoices")
  }

  // ─── computed ────────────────────────────────────────────────
  const editTax   = Math.round(editForm.subtotal * (editForm.taxRate / 100))
  const editTotal = editForm.subtotal + editTax
  const profitEx   = salesBreak.ex  - costBreak.ex
  const profitInc  = salesBreak.inc - costBreak.inc
  const profitTax  = profitInc - profitEx
  const profitRate = salesBreak.ex > 0 ? ((profitEx / salesBreak.ex) * 100).toFixed(1) : "—"

  // ─── Loading / 404 ───────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center h-64 text-navy-400 text-[13px]">読み込み中...</div>
  if (!inv) return null

  const payment = inv.payments?.[0]

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      <Link href="/admin/invoices"
        className="inline-flex items-center gap-1.5 text-[12px] text-navy-400 hover:text-navy-700 transition-colors">
        <ArrowLeft size={13} />請求書一覧に戻る
      </Link>

      {/* ヘッダーカード */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-navy-400 uppercase tracking-[0.06em] mb-1">請求書番号</p>
            <h1 className="text-[22px] font-medium text-navy-900 tabular">{inv.invoiceNumber}</h1>
            <p className="text-[13px] text-navy-500 mt-1">{inv.company.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge status={inv.status} role="ADMIN" />
            {!isEditing && (inv.status === "PENDING" || inv.status === "OVERDUE" || inv.status === "ISSUED") && (
              <button className="btn btn-outline-gold" onClick={() => setShowPay(true)}>着金確認</button>
            )}
            {!isEditing && inv.status === "PAYMENT_CONFIRMED" && (
              <button className="btn btn-navy" onClick={() => setShowClr(true)}>消込処理</button>
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
              <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── 左カラム ── */}
        <div className="col-span-2 space-y-4">

          {/* OCR ゾーン（編集時のみ） */}
          {isEditing && (
            <div
              onDragEnter={e => { e.preventDefault(); setOcrDragging(true) }}
              onDragOver={e => { e.preventDefault(); setOcrDragging(true) }}
              onDragLeave={e => { e.preventDefault(); setOcrDragging(false) }}
              onDrop={e => { e.preventDefault(); setOcrDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleOcrFile(f) }}
              className={`relative border-2 border-dashed rounded-xl transition-all ${
                ocrDragging ? "border-gold-400 bg-gold-50"
                : ocrFields.size > 0 ? "border-emerald-400 bg-emerald-50"
                : "border-navy-200 bg-white hover:border-gold-400 hover:bg-gold-50"
              }`}
            >
              <input ref={ocrInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = "" }}
                disabled={ocrLoading} />
              <div className="flex flex-col items-center justify-center gap-2 py-5 cursor-pointer"
                onClick={() => { if (!ocrLoading) ocrInputRef.current?.click() }}>
                {ocrLoading ? (
                  <><Loader2 size={24} className="text-gold-500 animate-spin" />
                  <p className="text-[13px] font-medium text-navy-600">OCR解析中...</p></>
                ) : ocrFields.size > 0 ? (
                  <><CheckCircle2 size={24} className="text-emerald-500" />
                  <p className="text-[13px] font-medium text-emerald-700">{ocrFields.size}項目を自動入力しました</p>
                  <p className="text-[11px] text-navy-400">別ファイルをドロップして上書きできます</p></>
                ) : (
                  <><ScanText size={24} className="text-navy-300" />
                  <p className="text-[13px] font-medium text-navy-600">請求書をドロップしてOCR自動入力</p>
                  <p className="text-[11px] text-navy-400">PDF・JPG・PNG 対応 ／ クリックでファイルを選択</p></>
                )}
              </div>
              {ocrError && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-t border-red-200 rounded-b-xl">
                  <AlertCircle size={13} className="text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-600">{ocrError}</p>
                </div>
              )}
            </div>
          )}

          {/* 基本情報 */}
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">基本情報</h2>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div className="col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="form-label !mb-0">件名</label>
                    {ocrFields.has("subject") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                  </div>
                  <input className={`form-input ${ocrFields.has("subject") ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="form-label !mb-0">請求日</label>
                    {ocrFields.has("issueDate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                  </div>
                  <input type="date" className={`form-input ${ocrFields.has("issueDate") ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={editForm.issueDate} onChange={e => setEditForm(f => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="form-label !mb-0">支払期限</label>
                    {ocrFields.has("dueDate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                  </div>
                  <input type="date" className={`form-input ${ocrFields.has("dueDate") ? "border-emerald-300 bg-emerald-50" : ""}`}
                    value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">請求先</label>
                  <div className="form-input bg-navy-50 text-navy-500 cursor-default">{inv.company.name}</div>
                </div>
                <div className="col-span-2">
                  <label className="form-label">担当者</label>
                  <select className="form-input" value={editForm.assignedUserId}
                    onChange={e => setEditForm(f => ({ ...f, assignedUserId: e.target.value }))}>
                    <option value="">未設定</option>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="form-label">備考</label>
                  <textarea className="form-input h-20 resize-none" value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                  {[
                    ["件名", inv.subject],
                    ["請求日", dateStr(inv.issueDate)],
                    ["支払期限", dateStr(inv.dueDate)],
                    ["請求先", inv.company.name],
                    ...(inv.assignedUser ? [["担当者", inv.assignedUser.name]] : []),
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.05em] mb-0.5">{label}</p>
                      <p className="text-navy-900 font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                {inv.notes && (
                  <div className="mt-4 pt-4 border-t border-navy-100">
                    <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.05em] mb-1">備考</p>
                    <p className="text-[13px] text-navy-700">{inv.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 金額 */}
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">金額</h2>
            {isEditing ? (
              <div className="space-y-3 text-[13px]">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="form-label !mb-0">小計（税抜）</label>
                      {ocrFields.has("subtotal") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                    </div>
                    <input type="number" className={`form-input ${ocrFields.has("subtotal") ? "border-emerald-300 bg-emerald-50" : ""}`}
                      value={editForm.subtotal}
                      onChange={e => {
                        const sub = Number(e.target.value)
                        setEditForm(f => ({ ...f, subtotal: sub }))
                        setSalesBreak(prev => ({ ...prev, ex: sub, inc: calcInc(sub, prev.taxRate) }))
                      }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="form-label !mb-0">消費税率</label>
                      {ocrFields.has("taxRate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                    </div>
                    <select className="form-input" value={editForm.taxRate}
                      onChange={e => setEditForm(f => ({ ...f, taxRate: Number(e.target.value) }))}>
                      <option value={10}>10%</option>
                      <option value={8}>8%（軽減）</option>
                      <option value={0}>0%（非課税）</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">消費税額（自動）</label>
                    <div className="form-input bg-navy-50 text-navy-600 cursor-default">¥{editTax.toLocaleString("ja-JP")}</div>
                  </div>
                </div>
                <div className="p-3 bg-navy-50 rounded-lg flex justify-between text-[14px] font-medium">
                  <span className="text-navy-600">請求金額合計</span>
                  <span className="text-navy-900 text-[17px] tabular">¥{editTotal.toLocaleString("ja-JP")}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between text-navy-600">
                  <span>小計</span><span className="tabular">{yen(inv.subtotal)}</span>
                </div>
                <div className="flex justify-between text-navy-600">
                  <span>消費税</span><span className="tabular">{yen(inv.tax)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-navy-100 text-navy-900 font-medium text-[15px]">
                  <span>請求金額</span><span className="tabular">{yen(inv.amount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* 利益情報 */}
          {isEditing ? (
            <div className="card p-5">
              <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-1">利益情報</h2>
              <p className="text-[11px] text-navy-400 mb-4">取引先には表示されません（管理者のみ）</p>

              {/* 被請求書パネル */}
              <div className="mb-4 p-4 bg-navy-50 rounded-lg border border-navy-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0 text-[11px]">被請求書から原価を反映（複数選択可）</label>
                  <button type="button" onClick={() => setShowNewRcv(v => !v)}
                    className="text-[11px] text-gold-600 hover:text-gold-700 font-medium transition-colors">
                    ＋ 被請求書を新規作成
                  </button>
                </div>

                {/* 新規被請求書フォーム */}
                {showNewRcv && (
                  <div className="mb-3 p-3 bg-white rounded-lg border border-navy-200 space-y-2">
                    <p className="text-[11px] font-medium text-navy-700 mb-2">新規被請求書</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "仕入先名 *", key: "vendorName", type: "text", placeholder: "株式会社〇〇" },
                        { label: "件名 *",     key: "subject",    type: "text", placeholder: "システム開発費" },
                        { label: "請求日 *",   key: "issueDate",  type: "date", placeholder: "" },
                        { label: "支払期限 *", key: "dueDate",    type: "date", placeholder: "" },
                        { label: "金額（税込） *", key: "amount", type: "number", placeholder: "0" },
                        { label: "備考", key: "notes", type: "text", placeholder: "任意" },
                      ].map(({ label, key, type, placeholder }) => (
                        <div key={key}>
                          <label className="text-[10px] text-navy-500 block mb-0.5">{label}</label>
                          <input type={type} placeholder={placeholder}
                            value={(newRcv as any)[key]}
                            onChange={e => setNewRcv(p => ({ ...p, [key]: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400" />
                        </div>
                      ))}
                      <div>
                        <label className="text-[10px] text-navy-500 block mb-0.5">消費税率</label>
                        <select value={newRcv.taxRate} onChange={e => setNewRcv(p => ({ ...p, taxRate: Number(e.target.value) }))}
                          className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] bg-white focus:outline-none focus:border-navy-400">
                          <option value={10}>10%</option><option value={8}>8%</option><option value={0}>非課税</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-navy-500 block mb-0.5">担当者</label>
                        <select value={newRcv.assignedUserId} onChange={e => setNewRcv(p => ({ ...p, assignedUserId: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] bg-white focus:outline-none focus:border-navy-400">
                          <option value="">未設定</option>
                          {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {newRcv.amount && (() => {
                      const inc = Number(newRcv.amount)
                      const ex  = Math.floor(inc / (1 + newRcv.taxRate / 100))
                      return (
                        <div className="flex gap-3 px-2 py-1.5 bg-navy-50 rounded text-[11px] text-navy-600 tabular-nums">
                          <span>税込 <strong>{yen(inc)}</strong></span>
                          <span className="text-navy-300">|</span>
                          <span>税抜 <strong>{yen(ex)}</strong></span>
                          <span className="text-navy-300">|</span>
                          <span>消費税 <strong>{yen(inc - ex)}</strong></span>
                        </div>
                      )
                    })()}
                    <div>
                      <label className="text-[10px] text-navy-500 block mb-1">請求書ファイル（任意）</label>
                      <FileDropZone onFile={f => setRcvPdfFile(f)} currentFileName={rcvPdfFile?.name} compact />
                      {rcvPdfFile && <button type="button" onClick={() => setRcvPdfFile(null)} className="mt-1 text-[10px] text-red-400 hover:text-red-600">選択を解除</button>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={handleCreateRcv}
                        disabled={newRcvSaving || !newRcv.vendorName.trim() || !newRcv.subject.trim() || !newRcv.amount}
                        className="px-4 py-1.5 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-40 transition-colors">
                        {newRcvSaving ? "作成中..." : "作成して追加"}
                      </button>
                      <button type="button" onClick={() => setShowNewRcv(false)}
                        className="px-3 py-1.5 text-[12px] text-navy-400 hover:text-navy-600 rounded-lg hover:bg-navy-100 transition-colors">
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {/* 追加ドロップダウン */}
                <div className="flex gap-2 mb-3">
                  <select className="form-input flex-1" value={addingRcvId} onChange={e => setAddingRcvId(e.target.value)}>
                    <option value="">— 被請求書を選択 —</option>
                    {availableRcv.filter(r => !linkedRcvList.find(l => l.id === r.id)).map(r => (
                      <option key={r.id} value={r.id}>
                        {r.vendorName}｜{r.subject}｜¥{Number(r.amount).toLocaleString("ja-JP")}（税込）
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addRcvToLinked} disabled={!addingRcvId}
                    className="px-4 py-2 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-40 transition-colors whitespace-nowrap">
                    追加
                  </button>
                </div>

                {/* 選択済みリスト */}
                {linkedRcvList.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {linkedRcvList.map(r => {
                      const inc = Number(r.amount); const ex = Math.round(inc / 1.1)
                      return (
                        <div key={r.id} className="bg-white rounded-lg border border-navy-100 px-3 py-2 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-navy-800 truncate">{r.vendorName}｜{r.subject}</p>
                            <p className="text-[11px] text-navy-400 mt-0.5 tabular-nums">税抜 {yen(ex)}　税込 {yen(inc)}</p>
                          </div>
                          <button type="button" onClick={() => removeRcvFromLinked(r.id)}
                            className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors shrink-0">
                            解除
                          </button>
                        </div>
                      )
                    })}
                    {linkedRcvList.length > 1 && (
                      <div className="bg-navy-100 rounded-lg px-3 py-2 flex justify-between">
                        <span className="text-[11px] font-medium text-navy-600">合計（{linkedRcvList.length}件）</span>
                        <span className="text-[12px] font-medium text-navy-900 tabular-nums">税抜 {yen(totalRcvEx)}　税込 {yen(totalRcvInc)}</span>
                      </div>
                    )}
                    {linkedRcvList.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => applyRcvCost(false)}
                          className="flex-1 py-1.5 text-[12px] font-medium border border-navy-300 text-navy-700 rounded-lg hover:bg-navy-100 transition-colors">
                          税抜合計 {yen(totalRcvEx)} を原価に反映
                        </button>
                        <button type="button" onClick={() => applyRcvCost(true)}
                          className="flex-1 py-1.5 text-[12px] font-medium border border-navy-300 text-navy-700 rounded-lg hover:bg-navy-100 transition-colors">
                          税込合計 {yen(totalRcvInc)} を原価に反映
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 売上 / 原価 / 粗利 3カード */}
              <div className="flex items-start gap-2">
                {/* 売上カード */}
                <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                    <span className="text-[12px] font-semibold text-navy-800">売上</span>
                    <select value={salesBreak.taxRate} onChange={e => updateSalesField({ taxRate: Number(e.target.value) })}
                      className="text-[11px] border border-navy-200 rounded px-1.5 py-0.5 bg-white text-navy-600">
                      <option value={10}>10%</option><option value={8}>8%</option><option value={0}>非課税</option>
                    </select>
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50">
                    <p className="text-[10px] text-navy-400 mb-1">税込</p>
                    <input type="number" placeholder="0" value={salesBreak.inc || ""}
                      onChange={e => updateSalesField({ inc: Number(e.target.value) || 0, incChanged: true })}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] text-right tabular-nums focus:outline-none focus:border-navy-400" />
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50 bg-yellow-50">
                    <p className="text-[10px] font-semibold text-yellow-700 mb-1">税抜（主入力）</p>
                    <input type="number" placeholder="0" value={salesBreak.ex || ""}
                      onChange={e => updateSalesField({ ex: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border-2 border-yellow-400 rounded-md text-[12px] text-right tabular-nums bg-yellow-50 font-semibold focus:outline-none" />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                    <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                      {salesBreak.inc > 0 ? yen(taxAmt(salesBreak)) : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center pt-[52px] gap-[30px] text-navy-300 font-bold text-lg select-none">
                  <span>－</span><span>－</span><span>－</span>
                </div>

                {/* 原価カード */}
                <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                    <span className="text-[12px] font-semibold text-navy-800">原価</span>
                    <select value={costBreak.taxRate} onChange={e => updateCostField({ taxRate: Number(e.target.value) })}
                      className="text-[11px] border border-navy-200 rounded px-1.5 py-0.5 bg-white text-navy-600">
                      <option value={10}>10%</option><option value={8}>8%</option><option value={0}>非課税</option>
                    </select>
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50">
                    <p className="text-[10px] text-navy-400 mb-1">税込</p>
                    <input type="number" placeholder="0" value={costBreak.inc || ""}
                      onChange={e => updateCostField({ inc: Number(e.target.value) || 0, incChanged: true })}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] text-right tabular-nums focus:outline-none focus:border-navy-400" />
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50 bg-yellow-50">
                    <p className="text-[10px] font-semibold text-yellow-700 mb-1">税抜（主入力）</p>
                    <input type="number" placeholder="0" value={costBreak.ex || ""}
                      onChange={e => updateCostField({ ex: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border-2 border-yellow-400 rounded-md text-[12px] text-right tabular-nums bg-yellow-50 font-semibold focus:outline-none" />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                    <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                      {costBreak.inc > 0 ? yen(taxAmt(costBreak)) : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center pt-[52px] gap-[30px] text-navy-300 font-bold text-lg select-none">
                  <span>＝</span><span>＝</span><span>＝</span>
                </div>

                {/* 粗利カード */}
                <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                    <span className="text-[12px] font-semibold text-navy-800">粗利</span>
                    <span className={`text-[15px] font-bold tabular-nums ${
                      profitRate === "—" ? "text-navy-300" : Number(profitRate) >= 30 ? "text-emerald-600" : "text-navy-700"
                    }`}>{profitRate !== "—" ? `${profitRate}%` : "—"}</span>
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50">
                    <p className="text-[10px] text-navy-400 mb-1">税込</p>
                    <div className={`px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 font-medium ${
                      salesBreak.inc > 0 || costBreak.inc > 0 ? (profitInc >= 0 ? "text-emerald-700" : "text-red-600") : "text-navy-300"
                    }`}>{salesBreak.inc > 0 || costBreak.inc > 0 ? yen(profitInc) : "—"}</div>
                  </div>
                  <div className="px-3 py-2 border-b border-navy-50 bg-emerald-50">
                    <p className="text-[10px] font-semibold text-emerald-700 mb-1">税抜</p>
                    <div className={`px-2 py-1.5 border border-emerald-200 rounded-md text-[13px] text-right tabular-nums bg-emerald-50 font-bold ${
                      salesBreak.ex > 0 || costBreak.ex > 0 ? (profitEx >= 0 ? "text-emerald-700" : "text-red-600") : "text-navy-300"
                    }`}>{salesBreak.ex > 0 || costBreak.ex > 0 ? yen(profitEx) : "—"}</div>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                    <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                      {salesBreak.inc > 0 || costBreak.inc > 0 ? yen(profitTax) : "—"}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-navy-300 mt-2">※ 税抜（主入力）が基本入力です。税込入力時は税率から税抜を自動逆算します。</p>
            </div>
          ) : inv.profit ? (
            <div className="card p-5">
              <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">利益情報</h2>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "売上",   value: yen(inv.profit.sales),       color: "" },
                  { label: "原価",   value: yen(inv.profit.cost),        color: "" },
                  { label: "粗利",   value: yen(inv.profit.grossProfit), color: "text-emerald-700" },
                  { label: "粗利率", value: `${Number(inv.profit.profitRate).toFixed(1)}%`,
                    color: Number(inv.profit.profitRate) >= 30 ? "text-emerald-700" : "text-amber-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-navy-50 rounded-lg p-3">
                    <p className="text-[10px] text-navy-400 uppercase tracking-[0.06em] mb-1">{label}</p>
                    <p className={`text-[15px] font-medium tabular ${color || "text-navy-900"}`}>{value}</p>
                  </div>
                ))}
              </div>
              {inv.linkedReceivedInvoices?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-navy-100">
                  <p className="text-[11px] text-navy-400 uppercase tracking-wider mb-2">経費内訳（{inv.linkedReceivedInvoices.length}件）</p>
                  <div className="space-y-1.5">
                    {inv.linkedReceivedInvoices.map((r: any) => {
                      const inc = Number(r.amount); const ex = Math.round(inc / 1.1)
                      return (
                        <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-navy-50 last:border-0">
                          <span className="text-navy-600 truncate max-w-[200px]">{r.vendorName}｜{r.subject}</span>
                          <button onClick={() => setRcvDetail(r)}
                            className="tabular-nums text-blue-600 hover:text-blue-800 hover:underline font-medium ml-2 shrink-0">
                            {yen(ex)}<span className="text-navy-400 font-normal">（税抜）/ {yen(inc)}（税込）</span>
                          </button>
                        </div>
                      )
                    })}
                    {inv.linkedReceivedInvoices.length > 1 && (
                      <div className="flex justify-between text-[12px] pt-2 font-medium text-navy-800">
                        <span>合計（税抜）</span>
                        <span className="tabular-nums">{yen(inv.linkedReceivedInvoices.reduce((s: number, r: any) => s + Math.round(Number(r.amount) / 1.1), 0))}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* 商品画像（編集時のみ） */}
          {isEditing && (
            <div className="card p-5">
              <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-1">商品画像（任意）</h2>
              <p className="text-[11px] text-navy-400 mb-4">JPG・PNG・HEIC など（複数枚可）</p>
              <label
                onDragOver={e => { e.preventDefault(); setImgDragging(true) }}
                onDragLeave={e => { e.preventDefault(); setImgDragging(false) }}
                onDrop={e => { e.preventDefault(); setImgDragging(false); addImageFiles(Array.from(e.dataTransfer.files)) }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-5 cursor-pointer transition-all ${
                  imgDragging ? "border-gold-400 bg-gold-50" : "border-navy-200 hover:border-gold-400 hover:bg-gold-50"
                }`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-navy-300">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span className="text-[12px] text-navy-500">クリックまたはドラッグ＆ドロップで画像を追加</span>
                <input type="file" accept="image/*,.heic,.heif" multiple className="hidden"
                  onChange={e => addImageFiles(Array.from(e.target.files || []))} />
              </label>
              {productImagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {productImagePreviews.map((src, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-navy-100">
                      <img src={src} alt="" className="w-full h-24 object-cover" />
                      <button type="button" onClick={() => removeProductImage(i)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-[11px] flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── 右カラム ── */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-4">入金・消込状況</h2>
            {payment ? (
              <div className="space-y-3 text-[13px]">
                <Row label="入金ステータス" value={payment.paymentStatus === "CONFIRMED" ? "確認済み" : "未入金"} />
                {payment.paymentDate   && <Row label="入金日"  value={dateStr(payment.paymentDate)} />}
                {payment.paymentAmount && <Row label="入金額"  value={yen(payment.paymentAmount)} />}
                <div className="pt-2 border-t border-navy-100">
                  <Row label="消込ステータス" value={payment.clearStatus === "CLEARED" ? "消込済み" : "未消込"} />
                  {payment.clearedAt && <Row label="消込日" value={dateStr(payment.clearedAt)} />}
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
                <iframe src={pdfSignedUrl} className="w-full rounded-lg border border-navy-100" style={{ height: "500px" }} title={`${inv.invoiceNumber}.pdf`} />
                <a href={pdfSignedUrl} target="_blank" rel="noreferrer"
                   className="btn btn-outline-gold w-full justify-center gap-1.5 flex">
                  <ExternalLink size={12} />ファイルを開く
                </a>
                <FileDropZone onFile={handleFileUpload} loading={uploading} label="差し替え（PDF / 画像）" compact />
              </div>
            ) : (
              <FileDropZone onFile={handleFileUpload} loading={uploading} />
            )}
          </div>
        </div>
      </div>

      {showPay && <PaymentModal invoice={inv} onClose={() => setShowPay(false)} onSuccess={() => { setShowPay(false); fetchInv() }} />}
      {showClr && <ClearModal   invoice={inv} onClose={() => setShowClr(false)} onSuccess={() => { setShowClr(false); fetchInv() }} />}

      {rcvDetail && (
        <div className="fixed inset-0 bg-navy-900/40 z-50 flex items-center justify-center"
          onClick={e => e.target === e.currentTarget && setRcvDetail(null)}>
          <div className="bg-white rounded-xl border border-navy-200 p-6 w-[480px] shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-medium text-navy-900">被請求書 詳細</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: rcvDetail.status === "PAID" ? "#2e9e6218" : "#c4982818", color: rcvDetail.status === "PAID" ? "#2e9e62" : "#c49828" }}>
                {rcvDetail.status === "PAID" ? "送金済み" : "未送金"}
              </span>
            </div>
            <div className="space-y-0 text-[13px]">
              {[
                rcvDetail.invoiceNumber && ["請求書番号", rcvDetail.invoiceNumber],
                ["取引先（請求元）", rcvDetail.vendorName],
                ["件名", rcvDetail.subject],
                ["請求日", dateStr(String(rcvDetail.issueDate))],
                ["支払期限", dateStr(String(rcvDetail.dueDate))],
                ["金額（税込）", yen(Number(rcvDetail.amount))],
                ["税抜金額", yen(Math.round(Number(rcvDetail.amount) / 1.1))],
                rcvDetail.paidAt && ["送金日", dateStr(String(rcvDetail.paidAt))],
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
                className="px-5 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700">閉じる</button>
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
