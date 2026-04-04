import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "BillingPro — 請求管理システム",
  description: "請求書・入金確認・消込管理",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BillingPro",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
