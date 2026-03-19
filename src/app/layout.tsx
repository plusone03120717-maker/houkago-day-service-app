import type { Metadata, Viewport } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import './globals.css'

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: '放デイ管理アプリ',
  description: '放課後等デイサービス・児童発達支援 施設運営管理システム',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '放デイ管理',
  },
}

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full`}>
      <body className="h-full font-sans antialiased">{children}</body>
    </html>
  )
}
