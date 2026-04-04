"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FileDropZone } from "@/components/shared/FileDropZone"

export default function NewInvoicePage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  const [form, setForm] = useState({
    invoiceNumber: "",
    companyId: "",
    subject: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    subtotal: "",
    taxRate: "10",
    notes: "",
    sales: "",
    cost: "",
  })

  useEffect(() => {
    fetch("/api/companies").then(r => r.json()).then(setCompanies)
    // 請求書番号を自動生成
    const now = new Date()
    const num = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(Math.floor(Math.random() * 900) + 100)}`
    setForm(f => ({ ...f, invoiceNumber: num }))
  }, [])

  const subtotal = Number(form.subtotal) || 0
  const tax = Math.round(subtotal * (Number(form.taxRate) / 100))
  const total = subtotal + tax
  const grossProfit = (Number(form.sales) || 0) - (Number(form.cost) || 0)
  const profitRate = (Number(form.sales) || 0) > 0
    ? ((grossProfit / Number(form.sales)) * 100).toFixed(1) : "—"

  const [imgDragging, setImgDragging] = useState(false)

  const addImageFiles = (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/"))
    setImages(prev => [...prev, ...imgs])
    imgs.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setImagePreviews(prev => [...prev, ev.target?.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(Array.from(e.target.files || []))
  }

  const onImgDragOver  = (e: React.DragEvent) => { e.preventDefault(); setImgDragging(true) }
  const onImgDragLeave = (e: React.DragEvent) => { e.preventDefault(); setImgDragging(false) }
  const onImgDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setImgDragging(false)
    addImageFiles(Array.from(e.dataTransfer.files))
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: form.invoiceNumber,
          companyId: form.companyId,
          subject: form.subject,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          subtotal,
          tax,
          notes: form.notes,
          profit: form.sales && form.cost ? {
            sales: Number(form.sales),
            cost: Number(form.cost),
            grossProfit,
            profitRate: Number(profitRate),
          } : undefined,
        }),
      })
      if (!res.ok) throw new Error("登録に失敗しました")
      const inv = await res.json()
      router.push(`/admin/invoices`)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = "w-full px-3 py-2 border border-navy-200 rounded-lg text-[13px] focus:outline-none focus:border-gold-500"
  const lbl = "block text-[11px] text-navy-400 uppercase tracking-wider mb-1"

  return (
    <div className="max-w-3xl space-y-4 animate-fade-in">
      <div>
        <h2 className="text-[14px] font-medium text-navy-900">請求書を登録</h2>
        <p className="text-[11px] text-navy-400 mt-0.5">必要事項を入力して登録してください</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 基本情報 */}
        <div className="bg-white rounded-lg border border-navy-100 p-5">
          <h3 className="text-[12px] font-medium text-navy-700 uppercase tracking-wider mb-4">基本情報</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>請求書番号</label>
              <input className={inp} value={form.invoiceNumber}
                onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} required />
            </div>
            <div>
              <label className={lbl}>取引先</label>
              <select className={inp} value={form.companyId}
                onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} required>
                <option value="">選択してください</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>件名（適用）</label>
              <input className={inp} placeholder="Webシステム開発費 など"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
            </div>
            <div>
              <label className={lbl}>請求日</label>
              <input type="date" className={inp} value={form.issueDate}
                onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} required />
            </div>
            <div>
              <label className={lbl}>支払期日</label>
              <input type="date" className={inp} value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} required />
            </div>
          </div>
        </div>

        {/* 金額 */}
        <div className="bg-white rounded-lg border border-navy-100 p-5">
          <h3 className="text-[12px] font-medium text-navy-700 uppercase tracking-wider mb-4">金額</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>小計（税抜）</label>
              <input type="number" className={inp} placeholder="0"
                value={form.subtotal}
                onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} required />
            </div>
            <div>
              <label className={lbl}>消費税率</label>
              <select className={inp} value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}>
                <option value="10">10%</option>
                <option value="8">8%（軽減）</option>
                <option value="0">0%（非課税）</option>
              </select>
            </div>
            <div>
              <label className={lbl}>消費税額</label>
              <div className={`${inp} bg-navy-50 text-navy-500`}>
                ¥{tax.toLocaleString("ja-JP")}
              </div>
            </div>
          </div>
          {/* 税込合計 */}
          <div className="mt-4 p-3 bg-navy-50 rounded-lg flex justify-between items-center">
            <span className="text-[13px] text-navy-600 font-medium">税込請求金額</span>
            <span className="text-[18px] font-medium text-navy-900 tabular">
              ¥{total.toLocaleString("ja-JP")}
            </span>
          </div>
        </div>

        {/* 利益情報 */}
        <div className="bg-white rounded-lg border border-navy-100 p-5">
          <h3 className="text-[12px] font-medium text-navy-700 uppercase tracking-wider mb-1">利益情報</h3>
          <p className="text-[11px] text-navy-400 mb-4">取引先には表示されません</p>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={lbl}>売上</label>
              <input type="number" className={inp} placeholder="0"
                value={form.sales}
                onChange={e => setForm(f => ({ ...f, sales: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>原価</label>
              <input type="number" className={inp} placeholder="0"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>粗利</label>
              <div className={`${inp} bg-navy-50 ${grossProfit > 0 ? "text-emerald-700" : "text-navy-500"}`}>
                {form.sales ? `¥${grossProfit.toLocaleString("ja-JP")}` : "—"}
              </div>
            </div>
            <div>
              <label className={lbl}>粗利率</label>
              <div className={`${inp} bg-navy-50 ${Number(profitRate) >= 30 ? "text-emerald-700" : "text-navy-500"}`}>
                {profitRate !== "—" ? `${profitRate}%` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* 商品画像 */}
        <div className="bg-white rounded-lg border border-navy-100 p-5">
          <h3 className="text-[12px] font-medium text-navy-700 uppercase tracking-wider mb-4">商品画像</h3>
          <label
            onDragOver={onImgDragOver}
            onDragLeave={onImgDragLeave}
            onDrop={onImgDrop}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all ${
              imgDragging ? "border-gold-400 bg-gold-50" : "border-navy-200 hover:border-gold-400 hover:bg-gold-50"
            }`}>
            <span className="text-[13px] text-navy-500">クリックまたはドラッグ＆ドロップで画像を追加</span>
            <span className="text-[11px] text-navy-400">JPG・PNG・GIF・HEIC・WEBP（複数選択可）</span>
            <input type="file" accept="image/*,.heic,.heif" multiple className="hidden"
              onChange={handleImageChange} />
          </label>
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-navy-100">
                  <img src={src} alt="" className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full
                               w-5 h-5 text-[11px] flex items-center justify-center">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PDF・備考 */}
        <div className="bg-white rounded-lg border border-navy-100 p-5">
          <h3 className="text-[12px] font-medium text-navy-700 uppercase tracking-wider mb-4">添付・備考</h3>
          <div className="space-y-3">
            <div>
              <label className={lbl}>請求書ファイル（PDF / 画像）</label>
              <FileDropZone
                onFile={f => setPdfFile(f)}
                currentFileName={pdfFile?.name}
              />
            </div>
            <div>
              <label className={lbl}>備考</label>
              <textarea className={`${inp} h-20 resize-none`} placeholder="メモ・特記事項"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex justify-end gap-3 pb-8">
          <button type="button" onClick={() => router.push("/admin/invoices")}
            className="px-5 py-2 text-[13px] border border-navy-200 rounded-lg text-navy-600 hover:bg-navy-50">
            キャンセル
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-[13px] bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-60">
            {saving ? "登録中..." : "請求書を登録する"}
          </button>
        </div>
      </form>
    </div>
  )
}