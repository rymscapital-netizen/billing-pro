export function isSooEstateCompanyName(companyName?: string | null) {
  return String(companyName ?? "").includes("\u5275\u592e\u30a8\u30b9\u30c6\u30fc\u30c8")
}

export function canViewInternalReports(user?: { role?: string | null; companyName?: string | null } | null) {
  return user?.role === "ADMIN" && isSooEstateCompanyName(user.companyName)
}
