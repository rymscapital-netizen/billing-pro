export const USER_DISPLAY_ORDER = ["浪田", "西岡", "入内嶋", "高橋"] as const

function normalizeUserName(name: unknown) {
  return String(name ?? "").replace(/髙/g, "高")
}

export function userSortRank(name: unknown) {
  const normalized = normalizeUserName(name)
  const index = USER_DISPLAY_ORDER.findIndex(orderName => normalized.includes(orderName))
  return index === -1 ? USER_DISPLAY_ORDER.length : index
}

export function compareUsersByDisplayOrder(a: { name?: unknown }, b: { name?: unknown }) {
  const rankDiff = userSortRank(a.name) - userSortRank(b.name)
  if (rankDiff !== 0) return rankDiff
  return normalizeUserName(a.name).localeCompare(normalizeUserName(b.name), "ja")
}

export function sortUsersByDisplayOrder<T extends { name?: unknown }>(users: T[]) {
  return [...users].sort(compareUsersByDisplayOrder)
}
