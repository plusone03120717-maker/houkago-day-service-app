'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatDate, getTodayJST } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Car,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BellRing,
  CalendarDays,
} from 'lucide-react'

type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

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

type UncontactedChild = { id: string; name: string }

type Props = {
  date: string
  filter: string
  contacts: Contact[]
  /** 全日付の未確認連絡（日付昇順） */
  unconfirmedContacts: Contact[]
  uncontactedChildren: UncontactedChild[]
}

/** 連絡1件分のカード。未確認セクション・日別セクションで共用する */
function ContactCard({
  contact: c,
  unread,
  reviewing,
  onReviewed,
}: {
  contact: Contact
  unread: boolean
  reviewing: boolean
  onReviewed: (id: string) => void
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 shadow-sm border flex items-start gap-3 ${
        unread ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'
      }`}
    >
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
        {unread && (
          <button
            onClick={() => onReviewed(c.id)}
            disabled={reviewing}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            確認済み
          </button>
        )}
      </div>
    </div>
  )
}

export function ParentContactsBoard({
  date,
  filter,
  contacts,
  unconfirmedContacts,
  uncontactedChildren,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  // 確認済みにした行をその場で反映する（再取得を待たずバッジ表示と揃える）
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const [reviewing, setReviewing] = useState(false)

  const today = getTodayJST()
  const isUnread = (c: Contact) => c.is_new && !reviewedIds.has(c.id)
  const unread = unconfirmedContacts.filter(isUnread)

  // 未確認連絡を日付ごとにまとめる（元データが日付昇順なのでキー順も昇順になる）
  const unreadByDate = new Map<string, Contact[]>()
  for (const c of unread) {
    const arr = unreadByDate.get(c.date) ?? []
    arr.push(c)
    unreadByDate.set(c.date, arr)
  }

  async function markReviewed(ids: string[]) {
    if (ids.length === 0) return
    setReviewing(true)
    await fetch('/api/parent-contacts/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setReviewedIds((prev) => new Set([...prev, ...ids]))
    setReviewing(false)
    startTransition(() => router.refresh())
  }

  function navigate(newDate: string, newFilter?: string) {
    const f = newFilter ?? filter
    startTransition(() => {
      router.push(`${pathname}?date=${newDate}&filter=${f}`)
    })
  }

  const dateObj = new Date(date + 'T00:00:00')

  const filtered =
    filter === 'pickup'
      ? contacts.filter(hasTransport)
      : filter === 'daytime'
        ? contacts.filter((c) => c.status === 'attending' && c.service_type === 'daytime_support')
        : contacts

  const attendingCount = contacts.filter((c) => c.status === 'attending').length
  const daytimeCount = contacts.filter((c) => c.status === 'attending' && c.service_type === 'daytime_support').length
  const absentCount = contacts.filter((c) => c.status === 'absent').length
  const pickupCount = contacts.filter(hasTransport).length

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">保護者連絡一覧</h1>

      {/* ===== 未確認の連絡（全日付・日付ごとにグループ表示） ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100 bg-amber-50/60">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-gray-900">
              未確認の連絡
              {unread.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {unread.length}
                </span>
              )}
            </p>
          </div>
          {unread.length > 0 && (
            <button
              onClick={() => markReviewed(unread.map((c) => c.id))}
              disabled={reviewing}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {reviewing ? '処理中...' : 'すべて確認済みにする'}
            </button>
          )}
        </div>

        {unread.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-gray-400">
            未確認の連絡はありません
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {[...unreadByDate.entries()].map(([d, dayContacts]) => {
              const rel = relativeLabel(d, today)
              return (
                <div key={d} className="px-4 py-3">
                  {/* 日付ヘッダー：クリックで下の日別ビューをその日に切り替え */}
                  <button
                    onClick={() => navigate(d)}
                    className="flex items-center gap-2 mb-2 group"
                    title="この日の連絡一覧を表示"
                  >
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 group-hover:underline">
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
                  </button>
                  <div className="space-y-2">
                    {dayContacts.map((c) => (
                      <ContactCard
                        key={c.id}
                        contact={c}
                        unread
                        reviewing={reviewing}
                        onReviewed={(id) => markReviewed([id])}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== 日別の連絡 ===== */}
      <div className="pt-2 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          日別の連絡
        </h2>

        {/* 日付ナビ */}
        <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
          <button
            onClick={() => navigate(addDays(date, -1))}
            className="p-1 text-gray-400 hover:text-gray-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <span className="font-bold text-gray-900">
              {dateObj.getFullYear()}年{formatDateLabel(date)}
            </span>
            {date === today && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-600 text-white">
                今日
              </span>
            )}
          </div>
          <button
            onClick={() => navigate(addDays(date, 1))}
            className="p-1 text-gray-400 hover:text-gray-700"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {date !== today && (
          <div className="text-center">
            <button
              onClick={() => navigate(today)}
              className="text-xs text-indigo-600 underline"
            >
              今日に戻る
            </button>
          </div>
        )}

        {/* サマリーカード */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-2xl font-bold text-green-700">{attendingCount}</p>
            <p className="text-xs text-green-600">利用する</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
            <p className="text-2xl font-bold text-orange-500">{daytimeCount}</p>
            <p className="text-xs text-orange-500">日中一時</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
            <p className="text-2xl font-bold text-red-500">{absentCount}</p>
            <p className="text-xs text-red-500">お休み</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
            <p className="text-2xl font-bold text-blue-600">{pickupCount}</p>
            <p className="text-xs text-blue-500">送迎あり</p>
          </div>
        </div>

        {/* フィルタ */}
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'すべて' },
            { value: 'pickup', label: '送迎あり' },
            // 送り/迎えの内訳は各カードのバッジで確認できる
            { value: 'daytime', label: '日中一時' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => navigate(date, f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 連絡一覧 */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">
            <p className="text-sm">この日の連絡はありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                unread={isUnread(c)}
                reviewing={reviewing}
                onReviewed={(id) => markReviewed([id])}
              />
            ))}
          </div>
        )}

        {/* 未連絡の児童 */}
        {uncontactedChildren.length > 0 && (
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm font-semibold text-yellow-800">
                まだ連絡が来ていない児童（{uncontactedChildren.length}名）
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {uncontactedChildren.map((c) => (
                <span
                  key={c.id}
                  className="text-xs bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full font-medium"
                >
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
