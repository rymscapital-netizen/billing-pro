export { auth as default } from "@/lib/auth"

export const config = {
  matcher: ["/((?!api/auth|api/register|_next|favicon.ico|login|register).*)"],
}