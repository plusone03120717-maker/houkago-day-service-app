'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BellRing, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { notifyScheduleWeek } from '@/app/actions/schedule-week'
import {
  STATUS_LABEL,
  shortDate,
  weekLabel,
  type ChildWeekStatus,
} from '@/lib/schedule-week-confirm'
import type { StaffWeekOverview } from '@/lib/schedule-week-confirm-db'

const STATUS_STYLE: Record<ChildWeekStatus, string> = {
  no_plan: 'bg-gray-100 text-gray-500',
  not_notified: 'bg-gray-100 text-gray-600',
  waiting: 'bg-amber-100 text-amber-800',
  changed: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-green-100 text-green-800',
}

/** 一覧で上に出す順（対応が要るものから） */
const STATUS_ORDER: ChildWeekStatus[] = ['changed', 'waiting', 'not_notified', 'confirmed', 'no_plan']

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
 * 利用状況の画面の「保護者への予定のお知らせ（週ごと）」。
 *
 * 週を選んで「保護者に知らせる」を押すと、保護者の画面に「予定の確認」が出る。
 * 下の一覧で、保護者が「確認しました」を押したかを児童ごとに見られる。
 */
export function ScheduleWeekPanel({
  overview,
  weekStart,
  prevHref,
  nextHref,
  canEdit,
}: {
  overview: StaffWeekOverview
  weekStart: string
  prevHref: string
  nextHref: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <BellRing className="h-4 w-4 text-indigo-600" />
      <h2 className="text-sm font-bold text-gray-900">保護者への予定のお知らせ（週ごと）</h2>
      <div className="ml-auto flex items-center gap-1 text-sm">
        <Link href={prevHref} aria-label="前の週" className="p-1 rounded hover:bg-gray-100">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="font-medium text-gray-800 tabular-nums">{weekLabel(weekStart)}</span>
        <Link href={nextHref} aria-label="次の週" className="p-1 rounded hover:bg-gray-100">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )

  if (!overview.ready) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        {header}
        <p className="text-sm text-gray-500">
          {overview.reason === 'error'
            ? '読みこめませんでした。時間をおいて、画面を開き直してください。'
            : 'この機能は準備中です。'}
        </p>
      </section>
    )
  }

  const rows = [...overview.rows].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.childName.localeCompare(b.childName, 'ja')
  )
  const count = (s: ChildWeekStatus) => rows.filter((r) => r.status === s).length
  const unsentChanges = rows.filter((r) => r.changedSinceNotice.length > 0).length
  const notified = !!overview.notice

  const buttonLabel = !notified
    ? 'この週の予定を保護者に知らせる'
    : unsentChanges > 0
    ? `変更を知らせる（${unsentChanges}人）`
    : 'もう一度知らせる'

  const handleNotify = () => {
    const confirmText = !notified
      ? `${weekLabel(weekStart)} の予定を、保護者に知らせます。\n保護者の画面に「予定の確認」が出ます。よろしいですか？`
      : `${weekLabel(weekStart)} の今の予定で、保護者にもう一度知らせます。よろしいですか？`
    if (!window.confirm(confirmText)) return
    setMessage(null)
    startTransition(async () => {
      const result = await notifyScheduleWeek(weekStart)
      if (result.error) {
        setMessage({ tone: 'error', text: result.error })
        return
      }
      setMessage({ tone: 'ok', text: '保護者の画面に「予定の確認」を出しました' })
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {header}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {notified ? (
          <span className="text-gray-600">
            {formatDateTime(overview.notice!.first_notified_at)} に知らせました
            {overview.notice!.notify_count > 1 && (
              <>（最後に知らせたのは {formatDateTime(overview.notice!.last_notified_at)}）</>
            )}
          </span>
        ) : (
          <span className="text-gray-600">この週は、まだ保護者に知らせていません</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['confirmed', 'waiting', 'changed'] as const).map((s) => (
          <span key={s} className={cn('rounded-full px-3 py-1 text-xs font-bold', STATUS_STYLE[s])}>
            {STATUS_LABEL[s]} {count(s)}人
          </span>
        ))}
        {!notified && (
          <span className={cn('rounded-full px-3 py-1 text-xs font-bold', STATUS_STYLE.not_notified)}>
            予定のある児童 {rows.length}人
          </span>
        )}
        {canEdit && (
          <Button
            size="sm"
            onClick={handleNotify}
            disabled={pending || rows.length === 0}
            className="ml-auto"
            variant={notified && unsentChanges === 0 ? 'outline' : 'default'}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {buttonLabel}
          </Button>
        )}
      </div>

      {message && (
        <p className={cn('text-xs', message.tone === 'ok' ? 'text-green-700' : 'text-red-600')}>
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? '一覧を閉じる' : `児童ごとの一覧を見る（${rows.length}人）`}
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">児童</th>
                    <th className="px-3 py-2 font-medium">保護者の確認</th>
                    <th className="px-3 py-2 font-medium">くわしく</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.childId} className="border-t border-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-900">{r.childName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_STYLE[r.status])}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {r.status === 'confirmed' && r.confirmedAt && `${formatDateTime(r.confirmedAt)} に確認`}
                        {r.status === 'changed' && (
                          <>変わった日：{r.changedSinceConfirm.map(shortDate).join('・')}</>
                        )}
                        {r.status !== 'confirmed' && r.changedSinceNotice.length > 0 && (
                          <span className="ml-1 text-orange-700">（まだ知らせていない変更あり）</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
