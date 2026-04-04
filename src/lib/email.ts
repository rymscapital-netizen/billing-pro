import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.EMAIL_FROM ?? "BillingPro <noreply@billing.example.co.jp>"

// ── 共通ヘルパー ────────────────────────────────────────────
const yen  = (n: number) => `¥${n.toLocaleString("ja-JP")}`
const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
  })

// ── HTML ベーステンプレート ─────────────────────────────────
function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f2f5fa; font-family: -apple-system, sans-serif; }
  .wrap { max-width:560px; margin:40px auto; background:#fff;
          border-radius:12px; overflow:hidden;
          border:1px solid #e4eaf4; }
  .header { background:#0f1f3d; padding:28px 32px; }
  .logo { font-size:20px; font-weight:600; color:#fff; letter-spacing:.5px; }
  .logo span { color:#e2c060; }
  .body { padding:32px; }
  h2 { font-size:17px; color:#0f1f3d; margin:0 0 16px; font-weight:600; }
  p  { font-size:14px; color:#3a4e6e; line-height:1.7; margin:0 0 12px; }
  .info-box { background:#f2f5fa; border-radius:8px; padding:16px 20px;
              margin:20px 0; border-left:3px solid #c49828; }
  .info-row { display:flex; justify-content:space-between; padding:5px 0;
              font-size:13px; color:#3a4e6e;
              border-bottom:1px solid #e4eaf4; }
  .info-row:last-child { border:none; }
  .info-label { color:#8a9ab8; }
  .info-value { font-weight:600; color:#0f1f3d; }
  .amount { font-size:22px; font-weight:700; color:#0f1f3d; }
  .btn { display:inline-block; background:#0f1f3d; color:#fff !important;
         padding:12px 28px; border-radius:8px; text-decoration:none;
         font-size:14px; font-weight:500; margin:16px 0; }
  .badge-red   { display:inline-block; background:#fdf0f0; color:#8a2020;
                 padding:3px 10px; border-radius:20px; font-size:12px;
                 font-weight:600; border:1px solid #f0b8b8; }
  .badge-gold  { display:inline-block; background:#fdf9ee; color:#8a6610;
                 padding:3px 10px; border-radius:20px; font-size:12px;
                 font-weight:600; border:1px solid #eed898; }
  .footer { background:#f9fbfe; padding:20px 32px; border-top:1px solid #e4eaf4; }
  .footer p { font-size:12px; color:#8a9ab8; margin:0; line-height:1.6; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">Billing<span>Pro</span></div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>このメールは BillingPro 請求管理システムから自動送信されています。<br>
    お心当たりのない場合はこのメールを無視してください。</p>
  </div>
</div>
</body>
</html>`
}

// ── 1. 請求書発行通知（取引先向け） ─────────────────────────
export async function sendInvoiceIssuedEmail(params: {
  to:            string
  clientName:    string
  invoiceNumber: string
  subject:       string
  amount:        number
  dueDate:       Date | string
  portalUrl:     string
}) {
  const html = baseHtml(`
    <h2>${params.clientName} 様</h2>
    <p>いつもお世話になっております。<br>
    下記の通り請求書を発行いたしましたのでご確認をお願いいたします。</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">請求書番号</span>
        <span class="info-value">${params.invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">件名</span>
        <span class="info-value">${params.subject}</span>
      </div>
      <div class="info-row">
        <span class="info-label">お支払期限</span>
        <span class="info-value" style="color:#c49828">${fmtDate(params.dueDate)}</span>
      </div>
      <div class="info-row" style="padding-top:10px">
        <span class="info-label">ご請求金額</span>
        <span class="amount">${yen(params.amount)}</span>
      </div>
    </div>

    <p>請求書の詳細は下記のポータルサイトよりご確認いただけます。</p>
    <a href="${params.portalUrl}" class="btn">請求書を確認する →</a>
  `)

  return resend.emails.send({
    from:    FROM,
    to:      params.to,
    subject: `【請求書】${params.invoiceNumber} / ${yen(params.amount)}`,
    html,
  })
}

// ── 2. 支払期限リマインダー（取引先向け） ───────────────────
export async function sendPaymentReminderEmail(params: {
  to:            string
  clientName:    string
  invoiceNumber: string
  amount:        number
  dueDate:       Date | string
  daysLeft:      number   // 0 = 当日, 7 = 7日前
  portalUrl:     string
}) {
  const isToday   = params.daysLeft === 0
  const isOverdue = params.daysLeft < 0

  const subject = isOverdue
    ? `【お支払いのお願い】${params.invoiceNumber} 期限超過のご連絡`
    : isToday
    ? `【本日期限】${params.invoiceNumber} お支払いのご確認`
    : `【お支払いリマインド】${params.invoiceNumber} 期限まで${params.daysLeft}日`

  const badge = isOverdue
    ? `<span class="badge-red">期限超過</span>`
    : `<span class="badge-gold">期限 ${params.daysLeft}日前</span>`

  const html = baseHtml(`
    <h2>${params.clientName} 様</h2>
    ${badge}
    <p style="margin-top:14px">
      ${isOverdue
        ? "下記の請求書のお支払い期限が過ぎております。お早めにご対応をお願いいたします。"
        : `下記の請求書のお支払い期限が${isToday ? "本日" : `${params.daysLeft}日後`}に迫っております。`}
    </p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">請求書番号</span>
        <span class="info-value">${params.invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">お支払期限</span>
        <span class="info-value" style="${isOverdue ? "color:#8a2020" : "color:#c49828"}">
          ${fmtDate(params.dueDate)}
        </span>
      </div>
      <div class="info-row" style="padding-top:10px">
        <span class="info-label">ご請求金額</span>
        <span class="amount">${yen(params.amount)}</span>
      </div>
    </div>

    <a href="${params.portalUrl}" class="btn">請求書を確認する →</a>
  `)

  return resend.emails.send({ from: FROM, to: params.to, subject, html })
}

// ── 3. 着金確認通知（管理者向け） ──────────────────────────
export async function sendPaymentConfirmedEmail(params: {
  to:            string   // 管理者メール
  invoiceNumber: string
  clientName:    string
  amount:        number
  paymentDate:   Date | string
  adminUrl:      string
}) {
  const html = baseHtml(`
    <h2>着金確認のお知らせ</h2>
    <p>以下の請求書の着金が確認されました。消込処理をお願いします。</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">請求書番号</span>
        <span class="info-value">${params.invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">取引先</span>
        <span class="info-value">${params.clientName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">入金日</span>
        <span class="info-value">${fmtDate(params.paymentDate)}</span>
      </div>
      <div class="info-row" style="padding-top:10px">
        <span class="info-label">入金額</span>
        <span class="amount">${yen(params.amount)}</span>
      </div>
    </div>

    <a href="${params.adminUrl}" class="btn">消込処理へ →</a>
  `)

  return resend.emails.send({
    from:    FROM,
    to:      params.to,
    subject: `【着金確認】${params.invoiceNumber} / ${params.clientName}`,
    html,
  })
}

// ── 4. 消込完了通知（取引先向け） ──────────────────────────
export async function sendClearedEmail(params: {
  to:            string
  clientName:    string
  invoiceNumber: string
  amount:        number
  clearedAt:     Date | string
  portalUrl:     string
}) {
  const html = baseHtml(`
    <h2>${params.clientName} 様</h2>
    <p>下記の請求書のお支払いが確認できました。<br>
    ありがとうございました。</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">請求書番号</span>
        <span class="info-value">${params.invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">処理完了日</span>
        <span class="info-value" style="color:#1a6e42">${fmtDate(params.clearedAt)}</span>
      </div>
      <div class="info-row" style="padding-top:10px">
        <span class="info-label">金額</span>
        <span class="amount" style="color:#1a6e42">${yen(params.amount)}</span>
      </div>
    </div>

    <p>ポータルサイトにて処理完了状況をご確認いただけます。</p>
    <a href="${params.portalUrl}" class="btn">ポータルで確認する →</a>
  `)

  return resend.emails.send({
    from:    FROM,
    to:      params.to,
    subject: `【お支払い完了】${params.invoiceNumber} ありがとうございました`,
    html,
  })
}
