'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Home, BookOpen, Bell, LogOut, Building2, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 保護者ポータルのメニュー。
 *
 * ready: false の項目はまだ使えないもの。隠さずに並べて「準備中」と分かるようにし、
 * 今後使えるようになることが保護者に伝わるようにしている。
 */
const navItems = [
  { href: '/parent', label: 'ホーム', icon: Home, ready: true },
  // 利用の連絡も、利用済みの実績も1つのカレンダーで見せる。
  // 以前は「出席確認」を別に置いていたが、同じ月の同じ日を2か所で見ることになっていた
  { href: '/parent/usage-contacts', label: '利用連絡', icon: CalendarCheck, ready: true },
  { href: '/parent/announcements', label: 'お知らせ', icon: Bell, ready: true },
  { href: '/parent/contact-notes', label: '連絡帳', icon: BookOpen, ready: false },
]

interface Props {
  userName?: string
  userId: string
}

export function ParentNav({ userName }: Props) {
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
          <span className="font-bold text-sm">保護者ポータル</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-80">{userName}</span>
          <button onClick={handleSignOut} aria-label="ログアウト" className="p-1.5 hover:bg-indigo-700 rounded">
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
            const className = cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]',
              !item.ready ? 'text-gray-300' : active ? 'text-indigo-600' : 'text-gray-400'
            )
            if (!item.ready) {
              return (
                <span key={item.href} className={className} aria-disabled="true">
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  <span className="text-[9px] leading-none">準備中</span>
                </span>
              )
            }
            return (
              <Link key={item.href} href={item.href} className={className}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* タブナビ（PC） */}
      <nav className="hidden sm:block bg-white border-b border-gray-200 sticky top-[52px] z-10">
        <div className="max-w-2xl mx-auto px-4 flex gap-5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            if (!item.ready) {
              return (
                <span
                  key={item.href}
                  aria-disabled="true"
                  className="flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-300"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <span className="text-[10px] rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-400">
                    準備中
                  </span>
                </span>
              )
            }
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
