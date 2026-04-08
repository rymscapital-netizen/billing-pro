"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, ScanText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { FileDropZone } from "@/components/shared/FileDropZone"

const schema = z.object({
  invoiceNumber: z.string().min(1, "請求書番号は必須です"),
  companyId:     z.string().min(1, "取引先を選択してください"),
  subject:       z.string().min(1, "件名は必須です"),
  issueDate:     z.string().min(1, "請求日は必須です"),
  dueDate:       z.string().min(1, "支払期限は必須です"),
  subtotal:      z.number({ invalid_type_error: "小計を入力してください" }).positive(),
  taxRate:       z.number().default(10),
  notes:         z.string().optional(),
})
type FormData = z.infer<typeof schema>

// 売上・原価の税込/税抜/消費税額を管理する型
type TaxBreakdown = { ex: number; inc: number; taxRate: number }
// 税込 → 税抜（小数点以下切り捨て）
const calcEx  = (inc: number, rate: number) => Math.floor(inc / (1 + rate / 100))
// 税抜 → 税込（四捨五入）
const calcInc = (ex: number, rate: number) => Math.round(ex * (1 + rate / 100))
const taxAmt  = (b: TaxBreakdown) => b.inc - b.ex

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`

export default function NewInvoicePage() {
  const router = useRouter()
  const [companies, setCompanies]       = useState<{ id: string; name: string }[]>([])
  const [adminUsers, setAdminUsers]     = useState<{ id: string; name: string }[]>([])
  const [assignedUserId, setAssignedUserId] = useState("")
  const [rcvInvoices, setRcvInvoices]     = useState<any[]>([])
  const [selectedRcvIds, setSelectedRcvIds] = useState<string[]>([])
  const [addingRcvId, setAddingRcvId]     = useState("")
  const [pdfFile, setPdfFile]           = useState<File | null>(null)
  const [productImages, setProductImages]       = useState<File[]>([])
  const [productImagePreviews, setProductImagePreviews] = useState<string[]>([])
  const [imgDragging, setImgDragging]           = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState("")

  // OCR
  const [ocrLoading, setOcrLoading]   = useState(false)
  const [ocrError,   setOcrError]     = useState("")
  const [ocrFields,  setOcrFields]    = useState<Set<string>>(new Set())
  const [ocrDragging, setOcrDragging] = useState(false)

  // 被請求書インライン作成
  const [showNewRcv, setShowNewRcv]         = useState(false)
  const [newRcvSaving, setNewRcvSaving]     = useState(false)
  const [rcvPdfFile, setRcvPdfFile]         = useState<File | null>(null)
  const [newRcv, setNewRcv] = useState({
    vendorName: "", subject: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    amount: "", taxRate: 10, notes: "", assignedUserId: "",
  })

  // 利益情報：売上・原価それぞれの税込/税抜/税率を独立管理
  const [salesBreak, setSalesBreak] = useState<TaxBreakdown>({ ex: 0, inc: 0, taxRate: 10 })
  const [costBreak,  setCostBreak]  = useState<TaxBreakdown>({ ex: 0, inc: 0, taxRate: 10 })
  // 新規取引先
  const [showNewCompany, setShowNewCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [addingCompany, setAddingCompany]   = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        taxRate:   10,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate:   new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      },
    })

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then(setCompanies)
    fetch("/api/received-invoices")
      .then((r) => r.ok ? r.json() : [])
      .then(setRcvInvoices)
    fetch("/api/users")
      .then((r) => r.ok ? r.json() : [])
      .then((users: any[]) => setAdminUsers(users.map((u: any) => ({ id: u.id, name: u.name }))))
  }, [])

  // 商品画像ヘルパー
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
  const onImgDragOver  = (e: React.DragEvent) => { e.preventDefault(); setImgDragging(true) }
  const onImgDragLeave = (e: React.DragEvent) => { e.preventDefault(); setImgDragging(false) }
  const onImgDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setImgDragging(false)
    addImageFiles(Array.from(e.dataTransfer.files))
  }

  // 選択中の被請求書（複数）
  const selectedRcvList = rcvInvoices.filter(r => selectedRcvIds.includes(r.id))
  const totalRcvInc = selectedRcvList.reduce((s, r) => s + Number(r.amount), 0)  // 合計税込
  const totalRcvEx  = Math.round(totalRcvInc / 1.1)                               // 合計税抜
  const totalRcvTax = totalRcvInc - totalRcvEx

  const handleOcrFile = async (file: File) => {
    setOcrLoading(true)
    setOcrError("")
    setOcrFields(new Set())
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/ocr/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "OCR処理に失敗しました")

      const e = data.extracted
      const filled = new Set<string>()

      if (e.invoiceNumber?.value) {
        setValue("invoiceNumber", e.invoiceNumber.value)
        filled.add("invoiceNumber")
      }
      if (e.issueDate?.value) {
        setValue("issueDate", e.issueDate.value)
        filled.add("issueDate")
      }
      if (e.dueDate?.value) {
        setValue("dueDate", e.dueDate.value)
        filled.add("dueDate")
      }
      if (e.subject?.value) {
        setValue("subject", e.subject.value)
        filled.add("subject")
      }
      if (e.subtotal?.value != null) {
        setValue("subtotal", Math.round(e.subtotal.value))
        filled.add("subtotal")
      }
      if (e.taxRate?.value != null) {
        setValue("taxRate", e.taxRate.value)
        filled.add("taxRate")
      }
      if (e.assignedUser?.value) {
        setAssignedUserId(e.assignedUser.value)
        filled.add("assignedUserId")
      }
      // 取引先名で部分一致マッチング（vendorName / customerName）
      const nameHint = e.vendorName?.value ?? e.customerName?.value ?? ""
      if (nameHint) {
        const norm = (s: string) => s.replace(/[株式会社|有限会社|合同会社|\s]/g, "").toLowerCase()
        const matched = companies.find(c =>
          norm(c.name).includes(norm(nameHint)) || norm(nameHint).includes(norm(c.name))
        )
        if (matched) {
          setValue("companyId", matched.id)
          filled.add("companyId")
        }
      }

      setOcrFields(filled)
    } catch (e: any) {
      setOcrError(e.message ?? "OCR処理に失敗しました")
    } finally {
      setOcrLoading(false)
    }
  }

  const handleOcrDrop = (ev: React.DragEvent) => {
    ev.preventDefault()
    setOcrDragging(false)
    const file = ev.dataTransfer.files?.[0]
    if (file) handleOcrFile(file)
  }

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return
    setAddingCompany(true)
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCompanyName.trim() }),
    })
    if (res.ok) {
      const company = await res.json()
      setCompanies(prev => [...prev, company].sort((a, b) => a.name.localeCompare(b.name, "ja")))
      setValue("companyId", company.id)
      setNewCompanyName("")
      setShowNewCompany(false)
    }
    setAddingCompany(false)
  }

  const addRcv = () => {
    if (!addingRcvId || selectedRcvIds.includes(addingRcvId)) return
    setSelectedRcvIds(prev => [...prev, addingRcvId])
    setAddingRcvId("")
  }

  const handleCreateRcv = async () => {
    if (!newRcv.vendorName.trim() || !newRcv.subject.trim() || !newRcv.amount) return
    setNewRcvSaving(true)
    try {
      const res = await fetch("/api/received-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName:     newRcv.vendorName.trim(),
          subject:        newRcv.subject.trim(),
          issueDate:      newRcv.issueDate,
          dueDate:        newRcv.dueDate,
          amount:         Number(newRcv.amount),
          notes:          newRcv.notes || undefined,
          assignedUserId: newRcv.assignedUserId || undefined,
        }),
      })
      if (!res.ok) throw new Error("作成失敗")
      const created = await res.json()

      // PDF が選択されていればアップロード
      if (rcvPdfFile) {
        const fd = new FormData()
        fd.append("file", rcvPdfFile)
        await fetch(`/api/received-invoices/${created.id}/upload-pdf`, { method: "POST", body: fd })
      }

      setRcvInvoices(prev => [...prev, created])
      setSelectedRcvIds(prev => [...prev, created.id])
      setNewRcv({
        vendorName: "", subject: "",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        amount: "", taxRate: 10, notes: "", assignedUserId: "",
      })
      setRcvPdfFile(null)
      setShowNewRcv(false)
    } catch (e) {
      console.error(e)
    } finally {
      setNewRcvSaving(false)
    }
  }
  const removeRcv = (id: string) => setSelectedRcvIds(prev => prev.filter(x => x !== id))
  const applyRcvCost = (useInclusive: boolean) => {
    if (useInclusive) {
      // 税込値をセット → 税抜を逆算
      const ex = Math.round(totalRcvInc / (1 + costBreak.taxRate / 100))
      setCostBreak(prev => ({ ...prev, ex, inc: totalRcvInc }))
    } else {
      // 税抜値をセット → 税込を再計算
      updateCostField({ ex: totalRcvEx })
    }
  }

  // 税額・合計をリアルタイム計算（表示用）
  const subtotal = watch("subtotal") || 0
  const taxRate  = watch("taxRate") || 10
  const tax      = Math.round(subtotal * (taxRate / 100))
  const total    = subtotal + tax

  // 粗利の自動計算
  const profitEx   = salesBreak.ex  - costBreak.ex
  const profitInc  = salesBreak.inc - costBreak.inc
  const profitTax  = profitInc - profitEx
  const profitRate = salesBreak.ex > 0
    ? ((profitEx / salesBreak.ex) * 100).toFixed(1) : "—"

  // 税抜入力 or 税率変更 → 税込を再計算
  // 税込入力 → 税抜を逆算
  const updateSalesField = (patch: Partial<TaxBreakdown> & { incChanged?: boolean }) => {
    setSalesBreak(prev => {
      const next = { ...prev, ...patch }
      if (patch.incChanged) {
        next.ex = calcEx(next.inc, next.taxRate)
      } else if (patch.taxRate !== undefined || patch.ex !== undefined) {
        next.inc = calcInc(next.ex, next.taxRate)
      }
      return next
    })
  }
  const updateCostField = (patch: Partial<TaxBreakdown> & { incChanged?: boolean }) => {
    setCostBreak(prev => {
      const next = { ...prev, ...patch }
      if (patch.incChanged) {
        next.ex = calcEx(next.inc, next.taxRate)
      } else if (patch.taxRate !== undefined || patch.ex !== undefined) {
        next.inc = calcInc(next.ex, next.taxRate)
      }
      return next
    })
  }

  // 請求書番号の自動生成
  useEffect(() => {
    const now = new Date()
    const num = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}${String(Math.floor(Math.random() * 900) + 100)}`
    setValue("invoiceNumber", num)
  }, [setValue])

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setError("")
    try {
      const payload = {
        invoiceNumber:  data.invoiceNumber,
        companyId:      data.companyId,
        assignedUserId: assignedUserId || undefined,
        subject:        data.subject,
        issueDate:     data.issueDate,
        dueDate:       data.dueDate,
        subtotal:      data.subtotal,
        tax,
        notes:         data.notes,
        profit: salesBreak.inc > 0 || costBreak.inc > 0
          ? {
              sales:          salesBreak.ex,
              cost:           costBreak.ex,
              grossProfit:    salesBreak.ex - costBreak.ex,
              profitRate:     salesBreak.ex > 0
                ? ((salesBreak.ex - costBreak.ex) / salesBreak.ex) * 100
                : 0,
              salesTaxRate:   salesBreak.taxRate,
              costTaxRate:    costBreak.taxRate,
              salesTaxAmount: taxAmt(salesBreak),
              costTaxAmount:  taxAmt(costBreak),
            }
          : undefined,
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const inv = await res.json()

      // PDF が選択されていればアップロード
      if (pdfFile) {
        const fd = new FormData()
        fd.append("file", pdfFile)
        await fetch(`/api/invoices/${inv.id}/upload-pdf`, { method: "POST", body: fd })
      }

      // 商品画像があればアップロード
      if (productImages.length > 0) {
        const fd = new FormData()
        productImages.forEach(f => fd.append("files", f))
        await fetch(`/api/invoices/${inv.id}/upload-images`, { method: "POST", body: fd })
      }

      router.push(`/admin/invoices/${inv.id}`)
    } catch (e: any) {
      setError(e.message || "登録に失敗しました")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <Link href="/admin/invoices"
            className="inline-flex items-center gap-1.5 text-[12px] text-navy-400
                       hover:text-navy-700 transition-colors">
        <ArrowLeft size={13} />
        請求書一覧に戻る
      </Link>

      {/* OCR ドロップゾーン */}
      <div
        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setOcrDragging(true) }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOcrDragging(true) }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setOcrDragging(false) }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setOcrDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleOcrFile(file)
        }}
        className={`relative border-2 border-dashed rounded-xl transition-all ${
          ocrDragging
            ? "border-gold-400 bg-gold-50"
            : ocrFields.size > 0
            ? "border-emerald-400 bg-emerald-50"
            : "border-navy-200 bg-white hover:border-gold-400 hover:bg-gold-50"
        }`}
      >
        {/* クリックでファイル選択（label を使わず button + input ref で制御） */}
        <input
          id="ocr-file-input"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = "" }}
          disabled={ocrLoading}
        />
        <div
          className="flex flex-col items-center justify-center gap-2 py-6 cursor-pointer select-none"
          onClick={() => !ocrLoading && document.getElementById("ocr-file-input")?.click()}
        >
          {ocrLoading ? (
            <>
              <Loader2 size={28} className="text-gold-500 animate-spin" />
              <p className="text-[13px] font-medium text-navy-600">OCR解析中...</p>
              <p className="text-[11px] text-navy-400">Azure Document Intelligence で処理中です</p>
            </>
          ) : ocrFields.size > 0 ? (
            <>
              <CheckCircle2 size={28} className="text-emerald-500" />
              <p className="text-[13px] font-medium text-emerald-700">
                {ocrFields.size}項目を自動入力しました
              </p>
              <p className="text-[11px] text-navy-400">別ファイルをドロップして上書きできます</p>
            </>
          ) : (
            <>
              <ScanText size={28} className="text-navy-300" />
              <p className="text-[13px] font-medium text-navy-600">
                請求書をドロップしてOCR自動入力
              </p>
              <p className="text-[11px] text-navy-400">PDF・JPG・PNG に対応 ／ クリックでファイルを選択</p>
            </>
          )}
        </div>
        {ocrError && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-t border-red-200 rounded-b-xl">
            <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
            <p className="text-[12px] text-red-600">{ocrError}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 基本情報 */}
        <div className="card p-5">
          <h2 className="text-[12px] font-medium text-navy-700 uppercase
                         tracking-[0.06em] mb-4">
            基本情報
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">請求書番号</label>
                {ocrFields.has("invoiceNumber") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <input className={`form-input ${ocrFields.has("invoiceNumber") ? "border-emerald-300 bg-emerald-50" : ""}`} {...register("invoiceNumber")} />
              {errors.invoiceNumber && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.invoiceNumber.message}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-navy-600 uppercase tracking-[0.05em]">取引先</span>
                  {ocrFields.has("companyId") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowNewCompany(v => !v); setNewCompanyName("") }}
                  className="text-[11px] text-gold-600 hover:text-gold-700 font-medium transition-colors"
                >
                  ＋ 新規追加
                </button>
              </div>
              <select className="form-input" {...register("companyId")}>
                <option value="">選択してください</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.companyId && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.companyId.message}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">件名</label>
                {ocrFields.has("subject") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <input className={`form-input ${ocrFields.has("subject") ? "border-emerald-300 bg-emerald-50" : ""}`} placeholder="Webシステム開発費"
                     {...register("subject")} />
              {errors.subject && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.subject.message}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">請求日</label>
                {ocrFields.has("issueDate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <input type="date" className={`form-input ${ocrFields.has("issueDate") ? "border-emerald-300 bg-emerald-50" : ""}`} {...register("issueDate")} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">支払期限</label>
                {ocrFields.has("dueDate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <input type="date" className={`form-input ${ocrFields.has("dueDate") ? "border-emerald-300 bg-emerald-50" : ""}`} {...register("dueDate")} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">担当者</label>
                {ocrFields.has("assignedUserId") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <select className={`form-input ${ocrFields.has("assignedUserId") ? "border-emerald-300 bg-emerald-50" : ""}`} value={assignedUserId}
                onChange={e => setAssignedUserId(e.target.value)}>
                <option value="">未設定</option>
                {adminUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 新規取引先フォーム（グリッド外で全幅表示） */}
          {showNewCompany && (
            <div className="mt-3 p-3 bg-navy-50 rounded-lg border border-navy-100 flex gap-2 items-center">
              <input
                type="text"
                className="form-input flex-1 text-[13px]"
                placeholder="会社名を入力"
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCompany() } }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddCompany}
                disabled={!newCompanyName.trim() || addingCompany}
                className="px-4 py-2 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {addingCompany ? "追加中..." : "追加"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewCompany(false)}
                className="px-3 py-2 text-[12px] text-navy-400 hover:text-navy-600 rounded-lg hover:bg-navy-100 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* 金額 */}
        <div className="card p-5">
          <h2 className="text-[12px] font-medium text-navy-700 uppercase
                         tracking-[0.06em] mb-4">
            金額
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">小計</label>
                {ocrFields.has("subtotal") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <input type="number" className={`form-input ${ocrFields.has("subtotal") ? "border-emerald-300 bg-emerald-50" : ""}`} placeholder="0"
                     {...register("subtotal", { valueAsNumber: true })} />
              {errors.subtotal && (
                <p className="text-[11px] text-red-600 mt-1">
                  {errors.subtotal.message}
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="form-label !mb-0">消費税率</label>
                {ocrFields.has("taxRate") && <span className="text-[10px] text-emerald-600 font-medium">OCR</span>}
              </div>
              <select className={`form-input ${ocrFields.has("taxRate") ? "border-emerald-300 bg-emerald-50" : ""}`} {...register("taxRate", { valueAsNumber: true })}>
                <option value={10}>10%</option>
                <option value={8}>8%（軽減）</option>
                <option value={0}>0%（非課税）</option>
              </select>
            </div>
            <div>
              <label className="form-label">消費税額（自動計算）</label>
              <div className="form-input bg-navy-50 text-navy-600 cursor-default">
                ¥{tax.toLocaleString("ja-JP")}
              </div>
            </div>
          </div>
          {/* 合計表示 */}
          <div className="mt-4 p-3 bg-navy-50 rounded-lg flex justify-between
                          items-center text-[14px] font-medium">
            <span className="text-navy-600">請求金額合計</span>
            <span className="text-navy-900 tabular text-[17px]">
              ¥{total.toLocaleString("ja-JP")}
            </span>
          </div>
        </div>

        {/* 利益情報 */}
        <div className="card p-5 overflow-visible">
          <h2 className="text-[12px] font-medium text-navy-700 uppercase
                         tracking-[0.06em] mb-1">
            利益情報
          </h2>
          <p className="text-[11px] text-navy-400 mb-4">
            取引先には表示されません（管理者のみ）
          </p>

          {/* 被請求書から原価を選択（複数可） */}
          <div className="mb-4 p-4 bg-navy-50 rounded-lg border border-navy-100">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">被請求書から原価を反映（複数選択可）</label>
              <button
                type="button"
                onClick={() => setShowNewRcv(v => !v)}
                className="text-[11px] text-gold-600 hover:text-gold-700 font-medium transition-colors"
              >
                ＋ 被請求書を新規作成
              </button>
            </div>

            {/* 被請求書インライン作成フォーム */}
            {showNewRcv && (
              <div className="mb-3 p-3 bg-white rounded-lg border border-navy-200 space-y-2">
                <p className="text-[11px] font-medium text-navy-700 mb-2">新規被請求書</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">仕入先名 *</label>
                    <input
                      type="text" placeholder="株式会社〇〇"
                      value={newRcv.vendorName}
                      onChange={e => setNewRcv(p => ({ ...p, vendorName: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">件名 *</label>
                    <input
                      type="text" placeholder="システム開発費"
                      value={newRcv.subject}
                      onChange={e => setNewRcv(p => ({ ...p, subject: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">請求日 *</label>
                    <input
                      type="date"
                      value={newRcv.issueDate}
                      onChange={e => setNewRcv(p => ({ ...p, issueDate: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">支払期限 *</label>
                    <input
                      type="date"
                      value={newRcv.dueDate}
                      onChange={e => setNewRcv(p => ({ ...p, dueDate: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">消費税率 *</label>
                    <select
                      value={newRcv.taxRate}
                      onChange={e => setNewRcv(p => ({ ...p, taxRate: Number(e.target.value) }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400 bg-white"
                    >
                      <option value={10}>10%（標準）</option>
                      <option value={8}>8%（軽減）</option>
                      <option value={0}>非課税</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">金額（税込） *</label>
                    <input
                      type="number" placeholder="0"
                      value={newRcv.amount}
                      onChange={e => setNewRcv(p => ({ ...p, amount: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] text-right focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">備考</label>
                    <input
                      type="text" placeholder="任意"
                      value={newRcv.notes}
                      onChange={e => setNewRcv(p => ({ ...p, notes: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-navy-500 block mb-0.5">担当者</label>
                    <select
                      value={newRcv.assignedUserId}
                      onChange={e => setNewRcv(p => ({ ...p, assignedUserId: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] focus:outline-none focus:border-navy-400 bg-white"
                    >
                      <option value="">未設定</option>
                      {adminUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 税込/税抜 内訳表示 */}
                {newRcv.amount && (
                  <div className="flex gap-3 px-1 py-2 bg-navy-50 rounded-md text-[11px] text-navy-600 tabular-nums">
                    {(() => {
                      const inc = Number(newRcv.amount)
                      const ex  = Math.floor(inc / (1 + newRcv.taxRate / 100))
                      const tax = inc - ex
                      return (
                        <>
                          <span>税込 <strong>{yen(inc)}</strong></span>
                          <span className="text-navy-300">|</span>
                          <span>税抜 <strong>{yen(ex)}</strong></span>
                          <span className="text-navy-300">|</span>
                          <span>消費税 <strong>{yen(tax)}</strong></span>
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* ファイルアップロード */}
                <div>
                  <label className="text-[10px] text-navy-500 block mb-1">請求書ファイル（PDF / 画像・任意）</label>
                  <FileDropZone
                    onFile={f => setRcvPdfFile(f)}
                    currentFileName={rcvPdfFile?.name}
                    compact
                  />
                  {rcvPdfFile && (
                    <button type="button" onClick={() => setRcvPdfFile(null)}
                      className="mt-1 text-[10px] text-red-400 hover:text-red-600">
                      選択を解除
                    </button>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreateRcv}
                    disabled={newRcvSaving || !newRcv.vendorName.trim() || !newRcv.subject.trim() || !newRcv.amount}
                    className="px-4 py-1.5 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-40 transition-colors"
                  >
                    {newRcvSaving ? "作成中..." : "作成して追加"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewRcv(false)}
                    className="px-3 py-1.5 text-[12px] text-navy-400 hover:text-navy-600 rounded-lg hover:bg-navy-100 transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {/* 追加ドロップダウン */}
            <div className="flex gap-2 mb-3">
              <select
                className="form-input flex-1"
                value={addingRcvId}
                onChange={e => setAddingRcvId(e.target.value)}
              >
                <option value="">— 被請求書を選択 —</option>
                {rcvInvoices
                  .filter(r => !selectedRcvIds.includes(r.id))
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.vendorName}｜{r.subject}｜¥{Number(r.amount).toLocaleString("ja-JP")}（税込）
                    </option>
                  ))}
              </select>
              <button type="button" onClick={addRcv} disabled={!addingRcvId}
                className="px-4 py-2 text-[12px] font-medium bg-navy-800 text-white rounded-lg hover:bg-navy-700 disabled:opacity-40 transition-colors whitespace-nowrap">
                追加
              </button>
            </div>

            {/* 選択済みリスト */}
            {selectedRcvList.length > 0 && (
              <div className="space-y-2 mb-3">
                {selectedRcvList.map(r => {
                  const inc = Number(r.amount)
                  const ex  = Math.round(inc / 1.1)
                  return (
                    <div key={r.id} className="bg-white rounded-lg border border-navy-100 px-3 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-navy-800 truncate">{r.vendorName}｜{r.subject}</p>
                        <p className="text-[11px] text-navy-400 mt-0.5 tabular-nums">
                          税抜 {yen(ex)}　消費税 {yen(inc - ex)}　税込 {yen(inc)}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeRcv(r.id)}
                        className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors shrink-0">
                        削除
                      </button>
                    </div>
                  )
                })}

                {/* 合計行 */}
                {selectedRcvList.length > 1 && (
                  <div className="bg-navy-100 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-navy-600">合計（{selectedRcvList.length}件）</span>
                    <span className="text-[12px] font-medium text-navy-900 tabular-nums">
                      税抜 {yen(totalRcvEx)}　消費税 {yen(totalRcvTax)}　税込 {yen(totalRcvInc)}
                    </span>
                  </div>
                )}

                {/* 反映ボタン */}
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
              </div>
            )}
          </div>

          {/* 利益情報 3カード横並び */}
          <div className="flex items-start gap-2">

            {/* ── 売上カード ── */}
            <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                <span className="text-[12px] font-semibold text-navy-800">売上</span>
                <select
                  value={salesBreak.taxRate}
                  onChange={e => updateSalesField({ taxRate: Number(e.target.value) })}
                  className="text-[11px] border border-navy-200 rounded px-1.5 py-0.5 bg-white text-navy-600 cursor-pointer"
                >
                  <option value={10}>10%</option>
                  <option value={8}>8%</option>
                  <option value={0}>非課税</option>
                </select>
              </div>
              {/* 税込 */}
              <div className="px-3 py-2 border-b border-navy-50">
                <p className="text-[10px] text-navy-400 mb-1">税込</p>
                <input
                  type="number" placeholder="0"
                  value={salesBreak.inc || ""}
                  onChange={e => updateSalesField({ inc: Number(e.target.value) || 0, incChanged: true })}
                  className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] text-right tabular-nums focus:outline-none focus:border-navy-400"
                />
              </div>
              {/* 税抜（主入力） */}
              <div className="px-3 py-2 border-b border-navy-50 bg-yellow-50">
                <p className="text-[10px] font-semibold text-yellow-700 mb-1">税抜（主入力）</p>
                <input
                  type="number" placeholder="0"
                  value={salesBreak.ex || ""}
                  onChange={e => updateSalesField({ ex: Number(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border-2 border-yellow-400 rounded-md text-[12px] text-right tabular-nums bg-yellow-50 font-semibold focus:outline-none focus:border-yellow-500"
                />
              </div>
              {/* 消費税額（読み取り専用） */}
              <div className="px-3 py-2">
                <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                  {salesBreak.inc > 0 ? yen(taxAmt(salesBreak)) : "—"}
                </div>
              </div>
            </div>

            {/* 演算子 － */}
            <div className="flex flex-col items-center justify-center pt-[52px] gap-[30px] text-navy-300 font-bold text-lg select-none">
              <span>－</span>
              <span>－</span>
              <span>－</span>
            </div>

            {/* ── 原価カード ── */}
            <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                <span className="text-[12px] font-semibold text-navy-800">原価</span>
                <select
                  value={costBreak.taxRate}
                  onChange={e => updateCostField({ taxRate: Number(e.target.value) })}
                  className="text-[11px] border border-navy-200 rounded px-1.5 py-0.5 bg-white text-navy-600 cursor-pointer"
                >
                  <option value={10}>10%</option>
                  <option value={8}>8%</option>
                  <option value={0}>非課税</option>
                </select>
              </div>
              {/* 税込 */}
              <div className="px-3 py-2 border-b border-navy-50">
                <p className="text-[10px] text-navy-400 mb-1">税込</p>
                <input
                  type="number" placeholder="0"
                  value={costBreak.inc || ""}
                  onChange={e => updateCostField({ inc: Number(e.target.value) || 0, incChanged: true })}
                  className="w-full px-2 py-1.5 border border-navy-200 rounded-md text-[12px] text-right tabular-nums focus:outline-none focus:border-navy-400"
                />
              </div>
              {/* 税抜（主入力） */}
              <div className="px-3 py-2 border-b border-navy-50 bg-yellow-50">
                <p className="text-[10px] font-semibold text-yellow-700 mb-1">税抜（主入力）</p>
                <input
                  type="number" placeholder="0"
                  value={costBreak.ex || ""}
                  onChange={e => updateCostField({ ex: Number(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 border-2 border-yellow-400 rounded-md text-[12px] text-right tabular-nums bg-yellow-50 font-semibold focus:outline-none focus:border-yellow-500"
                />
              </div>
              {/* 消費税額（読み取り専用） */}
              <div className="px-3 py-2">
                <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                  {costBreak.inc > 0 ? yen(taxAmt(costBreak)) : "—"}
                </div>
              </div>
            </div>

            {/* 演算子 ＝ */}
            <div className="flex flex-col items-center justify-center pt-[52px] gap-[30px] text-navy-300 font-bold text-lg select-none">
              <span>＝</span>
              <span>＝</span>
              <span>＝</span>
            </div>

            {/* ── 粗利カード（自動計算） ── */}
            <div className="flex-1 rounded-lg border border-navy-100 overflow-hidden">
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-3 py-2 bg-navy-50 border-b border-navy-100">
                <span className="text-[12px] font-semibold text-navy-800">粗利</span>
                <span className={`text-[15px] font-bold tabular-nums ${
                  profitRate === "—" ? "text-navy-300"
                  : Number(profitRate) >= 30 ? "text-emerald-600"
                  : "text-navy-700"
                }`}>
                  {profitRate !== "—" ? `${profitRate}%` : "—"}
                </span>
              </div>
              {/* 税込 */}
              <div className="px-3 py-2 border-b border-navy-50">
                <p className="text-[10px] text-navy-400 mb-1">税込</p>
                <div className={`px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 font-medium ${
                  salesBreak.inc > 0 || costBreak.inc > 0
                    ? profitInc >= 0 ? "text-emerald-700" : "text-red-600"
                    : "text-navy-300"
                }`}>
                  {salesBreak.inc > 0 || costBreak.inc > 0 ? yen(profitInc) : "—"}
                </div>
              </div>
              {/* 税抜 */}
              <div className="px-3 py-2 border-b border-navy-50 bg-emerald-50">
                <p className="text-[10px] font-semibold text-emerald-700 mb-1">税抜</p>
                <div className={`px-2 py-1.5 border border-emerald-200 rounded-md text-[13px] text-right tabular-nums bg-emerald-50 font-bold ${
                  salesBreak.ex > 0 || costBreak.ex > 0
                    ? profitEx >= 0 ? "text-emerald-700" : "text-red-600"
                    : "text-navy-300"
                }`}>
                  {salesBreak.ex > 0 || costBreak.ex > 0 ? yen(profitEx) : "—"}
                </div>
              </div>
              {/* 消費税額 */}
              <div className="px-3 py-2">
                <p className="text-[10px] text-navy-400 mb-1">消費税額</p>
                <div className="px-2 py-1.5 border border-navy-100 rounded-md text-[12px] text-right tabular-nums bg-navy-50 text-navy-500">
                  {salesBreak.inc > 0 || costBreak.inc > 0 ? yen(profitTax) : "—"}
                </div>
              </div>
            </div>

          </div>
          <p className="text-[10px] text-navy-300 mt-2">
            ※ 税抜（主入力）が基本入力です。税込入力時は税率から税抜を自動逆算します。
          </p>
        </div>

        {/* 備考 */}
        <div className="card p-5">
          <label className="form-label">備考</label>
          <textarea className="form-input h-20 resize-none" placeholder="メモ・特記事項"
                    {...register("notes")} />
        </div>

        {/* 商品画像（任意） */}
        <div className="card p-5">
          <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-1">
            商品画像（任意）
          </h2>
          <p className="text-[11px] text-navy-400 mb-4">JPG・PNG・HEIC・WEBP など（複数枚可）。ドラッグ＆ドロップでも追加できます</p>
          <label
            onDragOver={onImgDragOver}
            onDragLeave={onImgDragLeave}
            onDrop={onImgDrop}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all ${
              imgDragging ? "border-gold-400 bg-gold-50" : "border-navy-200 hover:border-gold-400 hover:bg-gold-50"
            }`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-navy-300">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="text-[13px] text-navy-500">クリックまたはドラッグ＆ドロップで画像を追加</span>
            <span className="text-[11px] text-navy-400">複数選択可</span>
            <input type="file" accept="image/*,.heic,.heif" multiple className="hidden"
              onChange={e => addImageFiles(Array.from(e.target.files || []))} />
          </label>
          {productImagePreviews.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mt-4">
              {productImagePreviews.map((src, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-navy-100">
                  <img src={src} alt="" className="w-full h-24 object-cover" />
                  <button type="button" onClick={() => removeProductImage(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-[11px] flex items-center justify-center leading-none">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ファイルアップロード（任意） */}
        <div className="card p-5">
          <h2 className="text-[12px] font-medium text-navy-700 uppercase tracking-[0.06em] mb-1">
            請求書ファイル（任意）
          </h2>
          <p className="text-[11px] text-navy-400 mb-4">PDF・画像（JPG / PNG / HEIC）に対応。登録後に詳細ページからも追加できます</p>
          <FileDropZone
            onFile={f => setPdfFile(f)}
            currentFileName={pdfFile?.name}
          />
          {pdfFile && (
            <button type="button" onClick={() => setPdfFile(null)}
              className="mt-2 text-[11px] text-red-400 hover:text-red-600">
              選択を解除
            </button>
          )}
        </div>

        {error && (
          <p className="text-[12px] text-red-600 bg-red-50 border border-red-200
                        rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Link href="/admin/invoices" className="btn">キャンセル</Link>
          <button type="submit" disabled={submitting} className="btn btn-navy px-6">
            {submitting ? "登録中..." : "請求書を登録する"}
          </button>
        </div>
      </form>
    </div>
  )
}
