"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { X, Info } from "lucide-react"

const schema = z.object({
  clearedAt: z.string().min(1, "消込日を入力してください"),
  notes:     z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  invoice: { id: string; invoiceNumber: string; amount: number; company: { name: string } }
  onClose: () => void
  onSuccess: () => void
}

export function ClearModal({ invoice, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { clearedAt: new Date().toISOString().slice(0, 10) },
  })

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
      onSuccess()
    } catch (e: any) {
      setError(e.message || "エラーが発生しました")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="flex items-center gap-3 mb-5">
          <div className="modal-bar" />
          <div className="flex-1">
            <h2 className="text-[15px] font-medium text-navy-900">消込処理</h2>
            <p className="text-[12px] text-gold-600 mt-0.5">{invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="btn btn-icon text-navy-400 border-transparent">
            <X size={16} />
          </button>
        </div>

        {/* インフォ */}
        <div className="flex gap-2.5 bg-navy-50 border border-navy-200 border-l-gold-400
                        border-l-[3px] rounded-lg px-4 py-3 mb-5 text-[12px] text-navy-700">
          <Info size={14} className="flex-shrink-0 text-gold-500 mt-0.5" />
          <span>
            着金確認済みの請求書を消込処理します。
            消込後は取引先ポータルに <strong>「処理完了」</strong> として反映されます。
          </span>
        </div>

        {/* 請求先サマリ */}
        <div className="bg-navy-50 rounded-lg px-4 py-3 mb-5 text-[12px]">
          <span className="text-navy-400">請求先：</span>
          <span className="text-navy-700 font-medium">{invoice.company.name}</span>
          <span className="mx-3 text-navy-300">|</span>
          <span className="text-navy-400">金額：</span>
          <span className="text-navy-900 font-medium tabular">
            ¥{Number(invoice.amount).toLocaleString("ja-JP")}
          </span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">消込日</label>
              <input type="date" className="form-input" {...register("clearedAt")} />
              {errors.clearedAt && (
                <p className="text-[11px] text-red-600 mt-1">{errors.clearedAt.message}</p>
              )}
            </div>
            <div>
              <label className="form-label">消込担当者</label>
              <input type="text" className="form-input" disabled
                     value="山田 太郎（セッションから自動）" />
            </div>
          </div>

          <div>
            <label className="form-label">備考</label>
            <input type="text" className="form-input" placeholder="消込メモ"
                   {...register("notes")} />
          </div>

          {error && (
            <p className="text-[12px] text-red-600 bg-red-50 border border-red-200
                          rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-navy-100">
            <button type="button" onClick={onClose} className="btn">キャンセル</button>
            <button type="submit" disabled={submitting} className="btn btn-navy">
              {submitting ? "処理中..." : "消込実行"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
