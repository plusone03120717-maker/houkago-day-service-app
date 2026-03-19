'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Home, BookOpen, MessageSquare, Calendar, Receipt, LogOut, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/parent', label: 'ホーム', icon: Home },
  { href: '/parent/contact-notes', label: '連絡帳', icon: BookOpen },
  { href: '/parent/messages', label: 'メッセージ', icon: MessageSquare },
  { href: '/parent/calendar', label: '予約', icon: Calendar },
  { href: '/parent/invoices', label: '請求書', icon: Receipt },
]

interface Props {
  userName?: string
  userId: string
}

export function ParentNav({ userName, userId }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* トップヘッダー */}
      <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <span className="font-bold text-sm">放デイ保護者ポータル</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-80">{userName}</span>
          <button onClick={handleSignOut} className="p-1.5 hover:bg-indigo-700 rounded">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ボトムナビゲーション（スマホ） */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10 sm:hidden">
        <div className="flex">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs',
                  active ? 'text-indigo-600' : 'text-gray-400'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* タブナビ（PC） */}
      <nav className="hidden sm:block bg-white border-b border-gray-200 sticky top-[52px] z-10">
        <div className="max-w-2xl mx-auto px-4 flex gap-6">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors',
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
