'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Bell, ClipboardList, CalendarCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type RecentContact = {
  id: string
  date: string
  childName: string
  label: string
}

interface Props {
  staffCount: number
  parentCount: number
  recentContacts: RecentContact[]
}

function formatMonthDay(dateStr: string) {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function NotificationBell({ staffCount, parentCount, recentContacts }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const total = staffCount + parentCount

  // メニュー外クリック・Escで閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `お知らせ ${total}件` : 'お知らせ'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">お知らせ</p>
          </div>

          {total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">未確認のお知らせはありません</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* 保護者からの利用連絡 */}
              {parentCount > 0 && (
                <Link
                  href="/parent-contacts"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <CalendarCheck className="h-4 w-4 text-green-600" />
                      保護者からの利用連絡
                    </span>
                    <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {parentCount}
                    </span>
                  </div>
                  {recentContacts.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-6">
                      {recentContacts.map((c) => (
                        <li key={c.id} className="text-xs text-gray-500 truncate">
                          {formatMonthDay(c.date)}　{c.childName}　{c.label}
                        </li>
                      ))}
                      {parentCount > recentContacts.length && (
                        <li className="text-xs text-gray-400">
                          ほか{parentCount - recentContacts.length}件
                        </li>
                      )}
                    </ul>
                  )}
                </Link>
              )}

              {/* スタッフ申請 */}
              {staffCount > 0 && (
                <Link
                  href="/staff-requests"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <ClipboardList className="h-4 w-4 text-indigo-600" />
                      スタッフ申請
                    </span>
                    <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {staffCount}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-6 text-xs text-gray-500">残業・有給・中抜けの未確認申請</p>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
