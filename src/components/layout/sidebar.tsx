'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Car,
  FileText,
  MessageSquare,
  Bell,
  Settings,
  BookOpen,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
} from 'lucide-react'
import { useState } from 'react'

const staffNav = [
  {
    group: 'メイン',
    items: [
      { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
      { href: '/attendance', label: '出席管理', icon: ClipboardList },
      { href: '/records', label: '日々の記録', icon: BookOpen },
    ],
  },
  {
    group: '支援・管理',
    items: [
      { href: '/support-plans', label: '個別支援計画', icon: ClipboardCheck },
      { href: '/transport', label: '送迎管理', icon: Car },
      { href: '/shifts', label: 'シフト管理', icon: CalendarDays },
      { href: '/billing', label: '国保連請求', icon: CreditCard },
    ],
  },
  {
    group: 'コミュニケーション',
    items: [
      { href: '/contact-notes', label: '連絡帳', icon: FileText },
      { href: '/messages', label: 'メッセージ', icon: MessageSquare },
      { href: '/announcements', label: 'お知らせ', icon: Bell },
    ],
  },
  {
    group: '設定',
    items: [
      { href: '/children', label: '児童管理', icon: Users },
      { href: '/settings', label: '設定', icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        'flex flex-col bg-gray-900 text-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-400" />
            <span className="font-bold text-sm">放デイ管理</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-gray-700 transition-colors ml-auto"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {staffNav.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed && (
              <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {group.group}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-gray-700',
                    active ? 'bg-indigo-700 text-white' : 'text-gray-300',
                    collapsed && 'justify-center px-2'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </div>
  )
}
