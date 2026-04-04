import { createClient } from "@supabase/supabase-js"

// サーバーサイド専用（service key はクライアントに渡さない）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const BUCKET = "invoices"

/**
 * PDFをSupabase Storageにアップロードし、保存パスを返す
 */
export async function uploadPdf(
  file: File,
  invoiceNumber: string,
): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "pdf"
  const path = `pdfs/${invoiceNumber}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

/**
 * 署名付きURLを生成（60分有効）
 */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`)
  return data.signedUrl
}

/**
 * ファイルを削除
 */
export async function deletePdf(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(`Storage delete failed: ${error.message}`)
}
