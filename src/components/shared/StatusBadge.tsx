import { InvoiceStatus } from "@prisma/client"

type BadgeVariant = "green" | "amber" | "red" | "blue" | "gold" | "gray" | "navy"

const STATUS_MAP: Record<
  InvoiceStatus,
  { admin: string; client: string; variant: BadgeVariant }
> = {
  DRAFT:             { admin: "下書き",      client: "下書き",      variant: "gray"  },
  ISSUED:            { admin: "発行済",      client: "ご請求中",    variant: "blue"  },
  PENDING:           { admin: "支払待ち",    client: "お支払い待ち", variant: "amber" },
  OVERDUE:           { admin: "期限超過",    client: "お支払い期限超過", variant: "red" },
  PAYMENT_CONFIRMED: { admin: "支払確認済み", client: "確認中",      variant: "amber" },
  CLEARED:           { admin: "消込済み",    client: "処理完了",    variant: "green" },
}

interface StatusBadgeProps {
  status: InvoiceStatus
  role?: "ADMIN" | "CLIENT"
  className?: string
}

export function StatusBadge({ status, role = "ADMIN", className }: StatusBadgeProps) {
  const { admin, client, variant } = STATUS_MAP[status]
  const label = role === "ADMIN" ? admin : client

  return (
    <span className={`badge badge-${variant} ${className ?? ""}`}>
      {label}
    </span>
  )
}

/* 汎用バッジ */
export function Badge({
  children,
  variant = "gray",
}: {
  children: React.ReactNode
  variant?: BadgeVariant
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
