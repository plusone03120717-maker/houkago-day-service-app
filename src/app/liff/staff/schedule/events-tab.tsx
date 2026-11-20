'use client'

import { useEffect, useState } from 'react'
import { Loader2, MapPin, User, Users, CalendarDays } from 'lucide-react'
import { EVENT_TYPES, EVENT_TYPE_INFO, eventTypeInfo, eventTimeLabel, type EventType } from '@/lib/schedule-events'

/**
 * スタッフ LINE の「会議・予定」タブ。今日から30日分の予定を、日ごとの一覧で見せる（見るだけ）。
 * 全員分を出し、自分が参加に入っている予定には「参加」の札を付ける。
 * 上のボタンで「自分が参加」や種類に絞りこめる。いちばん下の「もっと先を見る」で30日ずつ延ばす。
 */

type EventItem = {
  id: string
  date: string
  title: string
  eventType: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  location: string | null
  note: string | null
  childNames: string[]
  staffNames: string[]
  forAll: boolean
  mine: boolean
}

type Result =
  | { key: string; kind: 'ok'; events: EventItem[]; to: string }
  | { key: string; kind: 'error'; message: string }

type Filter = 'all' | 'mine' | EventType

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const STEP_DAYS = 30

function addDays(dateStr: string, diff: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + diff)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function dayHeading(dateStr: string, today: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = `${m}/${d}（${DOW[new Date(y, m - 1, d).getDay()]}）`
  if (dateStr === today) return `今日 ${base}`
  if (dateStr === addDays(today, 1)) return `明日 ${base}`
  return base
}

function isWeekendRed(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 0
}

export function EventsTab({ accessToken, today, reloadKey }: { accessToken: string; today: string; reloadKey: number }) {
  const [days, setDays] = useState(STEP_DAYS)
  const [filter, setFilter] = useState<Filter>('all')
  const [result, setResult] = useState<Result | null>(null)
  const requestKey = `${today}#${days}#${reloadKey}`
  const loading = result?.key !== requestKey

  useEffect(() => {
    let cancelled = false
    fetch('/api/liff/staff/schedule/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, from: today, days }),
    })
      .then(async (r) => {
        const json = await r.json() as { events?: EventItem[]; to?: string; error?: string }
        if (cancelled) return
        setResult(
          r.ok
            ? { key: requestKey, kind: 'ok', events: json.events ?? [], to: json.to ?? addDays(today, days - 1) }
            : { key: requestKey, kind: 'error', message: json.error ?? `HTTP ${r.status}` },
        )
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, kind: 'error', message: String(e) })
      })
    return () => { cancelled = true }
  }, [accessToken, today, days, requestKey])

  if (!result) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (result.kind === 'error') {
    return (
      <div className="px-3 pt-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-red-500 text-center">
          予定を取得できませんでした
        </div>
      </div>
    )
  }

  const shown = result.events.filter((e) =>
    filter === 'all' ? true : filter === 'mine' ? e.mine || e.forAll : e.eventType === filter,
  )
  const byDate = new Map<string, EventItem[]>()
  for (const e of shown) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const dates = Array.from(byDate.keys()).sort()

  const chips: { key: Filter; label: string; dot?: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'mine', label: '自分が参加' },
    ...EVENT_TYPES.map((t) => ({ key: t as Filter, label: EVENT_TYPE_INFO[t].label, dot: EVENT_TYPE_INFO[t].dot })),
  ]

  return (
    <div className={`px-3 pt-3 space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* 絞りこみ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === c.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            {c.dot && <span className={`w-2 h-2 rounded-full ${c.dot}`} />}
            {c.label}
          </button>
        ))}
      </div>

      {dates.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-6 text-sm text-gray-400 text-center">
          <CalendarDays className="h-6 w-6 mx-auto mb-2 text-gray-300" />
          {filter === 'all' ? 'この期間の予定はありません' : '当てはまる予定はありません'}
        </div>
      ) : (
        dates.map((d) => (
          <div key={d}>
            <p className={`text-xs font-bold mb-1.5 px-1 ${d === today ? 'text-indigo-600' : isWeekendRed(d) ? 'text-red-500' : 'text-gray-500'}`}>
              {dayHeading(d, today)}
            </p>
            <div className="space-y-2">
              {byDate.get(d)!.map((e) => {
                const ti = eventTypeInfo(e.eventType)
                // モニタリングは札と同じ「モニタリング」を2回出さず、子の名前を見出しにする
                const childAsTitle = e.eventType === 'monitoring' && e.childNames.length > 0
                return (
                  <div key={e.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ti.chip}`}>{ti.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{childAsTitle ? `${e.childNames.join('・')}さん` : e.title}</span>
                      </div>
                      {e.mine ? (
                        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-semibold">参加</span>
                      ) : e.forAll ? (
                        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">全員</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{eventTimeLabel(e)}</p>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {e.childNames.length > 0 && !childAsTitle && (
                        <p className="flex items-center gap-1"><User className="h-3 w-3" />{e.childNames.join('、')}</p>
                      )}
                      {e.location && (
                        <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</p>
                      )}
                      {!e.forAll && (
                        <p className="flex items-center gap-1"><Users className="h-3 w-3" />参加：{e.staffNames.join('・')}</p>
                      )}
                      {e.note && <p className="whitespace-pre-wrap pt-0.5">{e.note}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <button
        onClick={() => setDays((n) => n + STEP_DAYS)}
        disabled={loading || days >= 120}
        className="w-full rounded-2xl bg-white shadow-sm py-3 text-sm font-medium text-indigo-600 disabled:text-gray-400 flex items-center justify-center gap-1"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {days >= 120 ? '4か月先まで表示しています' : `もっと先を見る（${(() => { const [, m, dd] = result.to.split('-').map(Number); return `${m}/${dd}` })()} まで表示中）`}
      </button>
    </div>
  )
}
