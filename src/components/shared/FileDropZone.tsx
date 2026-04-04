"use client"

import { useRef, useState, useCallback } from "react"

// 受け付けるファイル種別
const ACCEPT_TYPES = [
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png",
  "image/gif", "image/webp", "image/heic", "image/heif",
]
const ACCEPT_ATTR = ACCEPT_TYPES.join(",") + ",.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"

export function isAcceptedFile(file: File) {
  return (
    ACCEPT_TYPES.includes(file.type) ||
    /\.(pdf|jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
  )
}

interface Props {
  /** 既にアップロード済みのファイル名（表示用） */
  currentFileName?: string | null
  /** ファイル選択/ドロップ時に呼ばれる */
  onFile: (file: File) => void
  /** ローディング中フラグ */
  loading?: boolean
  /** ラベルテキスト（省略時はデフォルト） */
  label?: string
  /** コンパクト表示（インラインフォーム内向け） */
  compact?: boolean
}

export function FileDropZone({ currentFileName, onFile, loading, label, compact }: Props) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [localName, setLocalName] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    if (!isAcceptedFile(file)) return
    setLocalName(file.name)
    // 画像のみプレビュー生成
    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
    onFile(file)
  }, [onFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const displayName = localName ?? currentFileName

  if (compact) {
    return (
      <div>
        <label
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 cursor-pointer transition-all ${
            isDragging
              ? "border-gold-400 bg-gold-50"
              : "border-navy-200 hover:border-gold-400 hover:bg-gold-50"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" className="text-navy-400 shrink-0">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span className="text-[12px] text-navy-500 truncate flex-1">
            {loading ? "アップロード中..." : displayName ?? (label ?? "PDF / 画像をドラッグ or クリック")}
          </span>
          {preview && (
            <img src={preview} alt="preview" className="w-8 h-8 object-cover rounded shrink-0" />
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={onInputChange}
          />
        </label>
        {displayName && !loading && (
          <p className="text-[10px] text-navy-400 mt-0.5 truncate">{displayName}</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all ${
          isDragging
            ? "border-gold-400 bg-gold-50"
            : "border-navy-200 hover:border-gold-400 hover:bg-gold-50"
        }`}
      >
        {preview ? (
          <img src={preview} alt="preview" className="max-h-32 object-contain rounded" />
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.5" className="text-navy-300">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        )}
        <div className="text-center">
          <p className="text-[13px] text-navy-500 font-medium">
            {loading
              ? "アップロード中..."
              : displayName
              ? displayName
              : (label ?? "PDF・画像をドラッグ＆ドロップ")}
          </p>
          {!displayName && !loading && (
            <p className="text-[11px] text-navy-400 mt-1">
              または クリックしてファイルを選択
            </p>
          )}
          <p className="text-[10px] text-navy-300 mt-1">
            PDF / JPG / PNG / HEIC / WEBP
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={onInputChange}
        />
      </label>
    </div>
  )
}
