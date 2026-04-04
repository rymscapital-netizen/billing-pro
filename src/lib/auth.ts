import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials)
          if (!parsed.success) return null
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
            include: { company: true },
          })
          if (!user || !user.isActive) return null
          const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
          if (!ok) return null
          return {
            id:          user.id,
            email:       user.email,
            name:        user.name,
            role:        user.role,
            companyId:   user.companyId,
            companyName: user.company.name,
          }
        } catch (e: any) {
          console.error("[auth] authorize error:", e?.message ?? e)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id          = user.id
        token.role        = (user as any).role
        token.companyId   = (user as any).companyId
        token.companyName = (user as any).companyName
        token.name        = user.name
      }
      return token
    },
    async session({ session, token }) {
      session.user.id          = token.id as string
      session.user.role        = token.role as string
      session.user.companyId   = token.companyId as string
      session.user.companyName = token.companyName as string
      session.user.name        = token.name as string
      return session
    },
    async redirect({ url, baseUrl }) {
      return baseUrl + "/admin/dashboard"
    },
  },
})
