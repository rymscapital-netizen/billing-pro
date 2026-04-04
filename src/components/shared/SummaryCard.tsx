type CardVariant = "gold" | "ok" | "warn" | "alert" | "navy" | "default"

const lineClass: Record<CardVariant, string> = {
  gold:    "card-line-gold",
  ok:      "card-line-green",
  warn:    "card-line-amber",
  alert:   "card-line-red",
  navy:    "card-line-navy",
  default: "card-line-gray",
}
const valueClass: Record<CardVariant, string> = {
  gold:    "text-gold-600",
  ok:      "text-emerald-700",
  warn:    "text-amber-700",
  alert:   "text-red-700",
  navy:    "text-navy-700",
  default: "text-navy-900",
}

interface SummaryCardProps {
  label: string
  value: string
  sub?: string
  variant?: CardVariant
  size?: "md" | "lg"
}

export function SummaryCard({
  label, value, sub, variant = "default", size = "lg",
}: SummaryCardProps) {
  return (
    <div className="card card-topline p-5">
      {/* カード上辺ライン */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-lg ${lineClass[variant]}`} />

      <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.06em] mb-2">
        {label}
      </p>
      <p className={`font-medium leading-tight tabular ${valueClass[variant]} ${
        size === "lg" ? "text-[22px]" : "text-[19px]"
      }`}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-navy-400 mt-1.5">{sub}</p>
      )}
    </div>
  )
}

interface ProgressCardProps {
  label: string
  current: number
  total: number
  formatValue?: (n: number) => string
}

export function ProgressCard({
  label, current, total,
  formatValue = (n) => `¥${n.toLocaleString("ja-JP")}`,
}: ProgressCardProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="card p-5">
      <p className="text-[10.5px] text-navy-400 uppercase tracking-[0.06em] mb-3">
        {label} — {formatValue(current)} / {formatValue(total)}
      </p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] mt-2 text-navy-400">
        <span className="text-gold-600 font-medium">{pct}% 回収済み</span>
        <span>{100 - pct}% 未回収</span>
      </div>
    </div>
  )
}
