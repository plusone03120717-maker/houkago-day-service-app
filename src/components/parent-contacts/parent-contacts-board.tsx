'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatDate, getTodayJST } from '@/lib/utils'
import {
  Car,
  Clock,
  CheckCircle2,
  XCircle,
  BellRing,
  CalendarDays,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react'

type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

type Contact = {
  id: string
  child_id: string
  date: string
  status: 'attending' | 'absent'
  service_type: 'regular' | 'daytime_support'
  service_start_time: string | null
  service_end_time: string | null
  transport_type: TransportType
  pickup_time: string | null
  dropoff_time: string | null
  note: string | null
  reported_at: string
  is_new: boolean
  approval_status: ApprovalStatus
  children: { id: string; name: string } | null
}

const TRANSPORT_LABELS: Record<TransportType, string> = {
  none: '送迎なし',
  both: '送り迎え',
  pickup_only: '迎えのみ',
  dropoff_only: '送りのみ',
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

/** DBの time 型（HH:MM:SS）を HH:MM で表示する */
function fmtTime(v: string | null) {
  return v ? v.slice(0, 5) : null
}

function hasTransport(c: Contact) {
  return c.status === 'attending' && c.transport_type !== 'none'
}

/** 承認の対象は「利用（予約）」の連絡のみ。お休みは確認済み操作だけ行う */
function needsApproval(c: Contact) {
  return c.status === 'attending'
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d, 'yyyy-MM-dd')
}

/** "2026-08-05" → "8月5日（火）" */
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`
}

/** 今日/明日/過去日の相対ラベル（該当しない日は null） */
function relativeLabel(dateStr: string, today: string): string | null {
  if (dateStr === today) return '今日'
  if (dateStr === addDays(today, 1)) return '明日'
  if (dateStr < today) return '過去日'
  return null
}

type Props = {
  /** 全日付の未確認連絡（日付昇順） */
  unconfirmedContacts: Contact[]
}

/** 連絡1件分のカード */
function ContactCard({
  contact: c,
  approval,
  reviewing,
  onReviewed,
  onApproval,
}: {
  contact: Contact
  approval: ApprovalStatus
  reviewing: boolean
  onReviewed: (id: string) => void
  onApproval: (id: string, next: ApprovalStatus) => void
}) {
  return (
    <div className="rounded-xl px-4 py-3 shadow-sm border bg-amber-50 border-amber-200 flex items-start gap-3">
      <div className="mt-0.5">
        {c.status === 'attending' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">
            {c.children?.name ?? '不明'}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              c.status === 'attending'
                ? c.service_type === 'daytime_support'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {c.status === 'attending'
              ? c.service_type === 'daytime_support' ? '日中一時' : '放デイ'
              : 'お休み'}
          </span>
          {hasTransport(c) && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              <Car className="h-3 w-3" />
              {TRANSPORT_LABELS[c.transport_type]}
            </span>
          )}
          {/* 承認状態（利用予約のみ） */}
          {needsApproval(c) && approval !== 'pending' && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${
                approval === 'approved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-500 text-white'
              }`}
            >
              {approval === 'approved' ? (
                <><ThumbsUp className="h-3 w-3" />承認済み</>
              ) : (
                <><ThumbsDown className="h-3 w-3" />非承認</>
              )}
            </span>
          )}
        </div>

        {/* 利用時間・送迎時間 */}
        {c.status === 'attending' && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {(fmtTime(c.service_start_time) || fmtTime(c.service_end_time)) && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3 text-indigo-400" />
                利用 {fmtTime(c.service_start_time) ?? '—'}〜{fmtTime(c.service_end_time) ?? '—'}
              </span>
            )}
            {fmtTime(c.pickup_time) && (
              <span className="text-xs text-gray-500">迎え {fmtTime(c.pickup_time)}</span>
            )}
            {fmtTime(c.dropoff_time) && (
              <span className="text-xs text-gray-500">送り {fmtTime(c.dropoff_time)}</span>
            )}
          </div>
        )}

        {c.note && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.note}</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(c.reported_at).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          受信
        </p>
        {/* 利用予約：承認する / 承認しない。お休み：確認するのみ */}
        {needsApproval(c) ? (
          approval === 'pending' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onApproval(c.id, 'approved')}
                disabled={reviewing}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                承認する
              </button>
              <button
                onClick={() => onApproval(c.id, 'rejected')}
                disabled={reviewing}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                承認しない
              </button>
            </div>
          ) : (
            <button
              onClick={() => onApproval(c.id, 'pending')}
              disabled={reviewing}
              className="text-xs text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
            >
              取り消す
            </button>
          )
        ) : (
          <button
            onClick={() => onReviewed(c.id)}
            disabled={reviewing}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            確認する
          </button>
        )}
      </div>
    </div>
  )
}

export function ParentContactsBoard({ unconfirmedContacts }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // 処理した行をその場で反映する（再取得を待たずベルバッジと揃える）
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())
  const [approvalOverrides, setApprovalOverrides] = useState<Record<string, ApprovalStatus>>({})
  const [reviewing, setReviewing] = useState(false)

  const today = getTodayJST()
  const approvalOf = (c: Contact): ApprovalStatus => approvalOverrides[c.id] ?? c.approval_status
  // 承認待ちに戻した行は再び未処理として扱う
  const isPending = (c: Contact) =>
    approvalOverrides[c.id] === 'pending' || !handledIds.has(c.id)
  const pending = unconfirmedContacts.filter(isPending)

  // 未確認連絡を日付ごとにまとめる（元データが日付昇順なのでキー順も昇順になる）
  const pendingByDate = new Map<string, Contact[]>()
  for (const c of pending) {
    const arr = pendingByDate.get(c.date) ?? []
    arr.push(c)
    pendingByDate.set(c.date, arr)
  }

  async function markReviewed(ids: string[]) {
    if (ids.length === 0) return
    setReviewing(true)
    await fetch('/api/parent-contacts/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setHandledIds((prev) => new Set([...prev, ...ids]))
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  async function setApproval(id: string, next: ApprovalStatus) {
    setReviewing(true)
    await fetch('/api/parent-contacts/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approvalStatus: next }),
    })
    setApprovalOverrides((prev) => ({ ...prev, [id]: next }))
    setHandledIds((prev) => {
      const nextSet = new Set(prev)
      if (next === 'pending') nextSet.delete(id)
      else nextSet.add(id)
      return nextSet
    })
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  /** 「すべて承認・確認する」: お休みは確認済み、利用予約は承認としてまとめて処理する */
  async function reviewAll(list: Contact[]) {
    const absents = list.filter((c) => !needsApproval(c))
    const reservations = list.filter(needsApproval)
    if (absents.length > 0) await markReviewed(absents.map((c) => c.id))
    for (const c of reservations) await setApproval(c.id, 'approved')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">保護者連絡一覧</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100 bg-amber-50/60">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-gray-900">
              未確認の連絡
              {pending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {pending.length}
                </span>
              )}
            </p>
          </div>
          {pending.length > 0 && (
            <button
              onClick={() => reviewAll(pending)}
              disabled={reviewing}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {reviewing ? '処理中...' : 'すべて承認・確認する'}
            </button>
          )}
        </div>

        {pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            未確認の連絡はありません
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {[...pendingByDate.entries()].map(([d, dayContacts]) => {
              const rel = relativeLabel(d, today)
              return (
                <div key={d} className="px-4 py-3">
                  {/* 日付ヘッダー */}
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-bold text-gray-900">
                      {formatDateLabel(d)}
                    </span>
                    {rel && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          rel === '今日'
                            ? 'bg-indigo-600 text-white'
                            : rel === '明日'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {rel}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{dayContacts.length}件</span>
                  </div>
                  <div className="space-y-2">
                    {dayContacts.map((c) => (
                      <ContactCard
                        key={c.id}
                        contact={c}
                        approval={approvalOf(c)}
                        reviewing={reviewing}
                        onReviewed={(id) => markReviewed([id])}
                        onApproval={setApproval}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        処理済みの連絡は、児童ごとの詳細ページと利用スケジュールで確認できます
      </p>
    </div>
  )
}
