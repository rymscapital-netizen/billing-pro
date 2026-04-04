import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, isAfter, isBefore, startOfDay } from "date-fns"
import { ja } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const yen = (n: number | string) =>
  `¥${Number(n).toLocaleString("ja-JP")}`

export const fmtDate = (d: Date | string) =>
  format(new Date(d), "yyyy/MM/dd", { locale: ja })

export const fmtDatetime = (d: Date | string) =>
  format(new Date(d), "yyyy/MM/dd HH:mm", { locale: ja })

export function isOverdue(dueDate: Date | string): boolean {
  return isBefore(new Date(dueDate), startOfDay(new Date()))
}

export function profitRateColor(rate: number): string {
  if (rate >= 30) return "text-emerald-700"
  if (rate >= 20) return "text-amber-700"
  return "text-red-700"
}
