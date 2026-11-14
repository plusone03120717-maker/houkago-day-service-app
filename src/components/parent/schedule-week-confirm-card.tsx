'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dayLine, shortDate, weekLabel } from '@/lib/schedule-week-confirm'
import type { ParentWeek } from '@/lib/schedule-week-confirm-db'

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * 保護者の画面の「予定の確認」。
 *
 * 施設が「保護者に知らせる」を押した週の予定を出し、「確認しました」を押してもらう。
 * 確認のあとで施設が予定を変えたときは、変わった日を出してもう一度押してもらう。
 * 保護者が自分で変えたいときは、今までどおり利用連絡のカレンダーから送る。
 */
export function ScheduleWeekConfirmCard({ showContactLink = true }: { showContactLink?: boolean }) {
  const [weeks, setWeeks] = useState<ParentWeek[]>([])
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<{ weekStart: string; text: string } | null>(null)

  const load = useCallback(() => {
    fetch('/api/parent/schedule-week')
      .then(async (res) => {
        if (!res.ok) return
        const json = await res.json() as { weeks?: ParentWeek[] }
        setWeeks(json.weeks ?? [])
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => { load() }, [load])

  const confirm = async (weekStart: string) => {
    setSending(weekStart)
    setError(null)
    try {
      const res = await fetch('/api/parent/schedule-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        setError({ weekStart, text: json.error ?? '送信できませんでした。時間をおいてもう一度お試しください' })
        return
      }
      load()
    } catch {
      setError({ weekStart, text: '通信エラーが発生しました' })
    } finally {
      setSending(null)
    }
  }

  if (weeks.length === 0) return null

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const pending = week.children.some((c) => c.status === 'waiting' || c.status === 'changed')
        const changed = week.children.some((c) => c.status === 'changed')
        return (
          <section
            key={week.weekStart}
            className={cn(
              'rounded-xl border p-4 space-y-3',
              pending ? 'border-green-500 bg-white' : 'border-green-100 bg-green-50'
            )}
          >
            <div className="flex items-center gap-2">
              {pending
                ? <CalendarCheck className="h-5 w-5 text-green-600" />
                : <CheckCircle2 className="h-5 w-5 text-green-600" />}
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {pending ? (changed ? '予定が変わりました' : '予定の確認のお願い') : '予定を確認しました'}
                </p>
                <p className="text-xs text-gray-500">{weekLabel(week.weekStart)}</p>
              </div>
            </div>

            {week.children.map((child) => (
              <div key={child.childId} className="space-y-1">
                {week.children.length > 1 && (
                  <p className="text-xs font-bold text-gray-700">{child.childName}</p>
                )}
                <ul className="text-sm text-gray-800 leading-relaxed">
                  {child.days.map((d) => {
                    const isChanged = child.status === 'changed' && child.changedSinceConfirm.includes(d.date)
                    return (
                      <li key={d.date} className={cn(isChanged && 'font-bold text-orange-700')}>
                        {dayLine(d)}
                        {isChanged && <span className="ml-1 text-xs">（変更）</span>}
                      </li>
                    )
                  })}
                </ul>
                {child.status === 'changed' &&
                  child.changedSinceConfirm.some((date) => !child.days.some((d) => d.date === date)) && (
                    <p className="text-xs text-orange-700">
                      予定がなくなった日：
                      {child.changedSinceConfirm
                        .filter((date) => !child.days.some((d) => d.date === date))
                        .map(shortDate)
                        .join('・')}
                    </p>
                  )}
              </div>
            ))}

            {pending ? (
              <button
                type="button"
                onClick={() => confirm(week.weekStart)}
                disabled={sending !== null}
                className="w-full rounded-lg bg-green-600 py-3 text-base font-bold text-white shadow-sm hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sending === week.weekStart && <Loader2 className="h-4 w-4 animate-spin" />}
                確認しました
              </button>
            ) : (
              <p className="text-xs text-green-800">
                {week.children
                  .map((c) => c.confirmedAt)
                  .filter((v): v is string => !!v)
                  .sort()
                  .slice(-1)
                  .map((v) => `${formatDateTime(v)} に確認しました`)}
              </p>
            )}

            {error?.weekStart === week.weekStart && sending === null && (
              <p className="text-xs text-red-600">{error.text}</p>
            )}

            {showContactLink && (
              <p className="text-xs text-gray-500">
                変えたい日は、
                <Link href="/parent/usage-contacts" className="text-indigo-600 underline">
                  利用連絡のカレンダー
                </Link>
                から連絡してください。
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
