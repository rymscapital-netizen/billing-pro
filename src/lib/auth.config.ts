import type { NextAuthConfig } from "next-auth"

// Middlewareで使う軽量設定（Prismaなし）
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic = ["/login", "/register"].some(p => nextUrl.pathname.startsWith(p))
      if (isPublic) return true
      if (!isLoggedIn) return false
      return true
    },
  },
}
