'use client'

import { useEffect, useState } from 'react'
import { Loader2, MapPin, User, Users, CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { EVENT_TYPES, EVENT_TYPE_INFO, eventTypeInfo, eventTimeLabel, type EventType } from '@/lib/schedule-events'
import { DayUsersSection } from './day-users-section'

/**
 * スタッフ LINE の「会議・予定」タブ（見るだけ）。全員分の予定を出し、自分が参加に入っている予定には「参加」の札を付ける。
 * - カレンダー（はじめに開く）：月のマス目に予定の色の点。日を押すと、下にその日の予定が並ぶ
 * - 一覧：今日から30日分を日ごとに並べ、「もっと先を見る」で30日ずつ延ばす
 * 上のボタンで「自分が参加」や種類に絞りこめる（カレンダーの点も同じく絞る）。
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
type View = 'calendar' | 'list'

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const STEP_DAYS = 30
const MAX_DOTS = 3
const VIEW_STORAGE_KEY = 'liff-staff-events-view'

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDays(dateStr: string, diff: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + diff)
  return toDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function dayHeading(dateStr: string, today: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = `${m}/${d}（${DOW[new Date(y, m - 1, d).getDay()]}）`
  if (dateStr === today) return `今日 ${base}`
  if (dateStr === addDays(today, 1)) return `明日 ${base}`
  return base
}

function isRedDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 0 || !!getJapaneseHolidayName(dateStr)
}

function loadView(): View {
  try {
    if (window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list') return 'list'
  } catch {
    // 保存できない環境では毎回カレンダーから
  }
  return 'calendar'
}

export function EventsTab({ accessToken, today, reloadKey }: { accessToken: string; today: string; reloadKey: number }) {
  const [view, setView] = useState<View>(loadView)
  const [cal, setCal] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })
  const [selected, setSelected] = useState(today)
  const [days, setDays] = useState(STEP_DAYS)
  const [filter, setFilter] = useState<Filter>('all')
  const [result, setResult] = useState<Result | null>(null)

  const chooseView = (next: View) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 保存できなくても切りかえはそのまま使える
    }
  }

  // カレンダーはその月の1日から月末まで、一覧は今日から days 日分を読む
  const lastDay = new Date(cal.year, cal.month, 0).getDate()
  const from = view === 'calendar' ? toDateStr(cal.year, cal.month, 1) : today
  const span = view === 'calendar' ? lastDay : days
  const requestKey = `${from}#${span}#${reloadKey}`
  const loading = result?.key !== requestKey

  useEffect(() => {
    let cancelled = false
    fetch('/api/liff/staff/schedule/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, from, days: span }),
    })
      .then(async (r) => {
        const json = await r.json() as { events?: EventItem[]; to?: string; error?: string }
        if (cancelled) return
        setResult(
          r.ok
            ? { key: requestKey, kind: 'ok', events: json.events ?? [], to: json.to ?? addDays(from, span - 1) }
            : { key: requestKey, kind: 'error', message: json.error ?? `HTTP ${r.status}` },
        )
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, kind: 'error', message: String(e) })
      })
    return () => { cancelled = true }
  }, [accessToken, from, span, requestKey])

  const shiftMonth = (diff: number) => {
    const dt = new Date(cal.year, cal.month - 1 + diff, 1)
    const next = { year: dt.getFullYear(), month: dt.getMonth() + 1 }
    setCal(next)
    // 今月に戻ったら今日、ほかの月は1日を選ぶ
    setSelected(today.startsWith(toDateStr(next.year, next.month, 1).slice(0, 7)) ? today : toDateStr(next.year, next.month, 1))
  }

  // カレンダーは読みこみ中に前の月の点を出さない（月を移った直後に別の月の予定が見えないように）。
  // 一覧は「もっと先を見る」の読みこみ中も、読んである分を出したままにする
  const events = result?.kind === 'ok' && !(view === 'calendar' && loading) ? result.events : []
  const shown = events.filter((e) =>
    filter === 'all' ? true : filter === 'mine' ? e.mine || e.forAll : e.eventType === filter,
  )
  const byDate = new Map<string, EventItem[]>()
  for (const e of shown) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])

  const chips: { key: Filter; label: string; dot?: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'mine', label: '自分が参加' },
    ...EVENT_TYPES.map((t) => ({ key: t as Filter, label: EVENT_TYPE_INFO[t].label, dot: EVENT_TYPE_INFO[t].dot })),
  ]

  const firstDow = new Date(cal.year, cal.month - 1, 1).getDay()
  const cells: (number | null)[] = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="px-3 pt-3 space-y-3">
      {/* カレンダー／一覧の切りかえ */}
      <div className="flex gap-2">
        {([['calendar', 'カレンダー', CalendarDays], ['list', '一覧', List]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => chooseView(key)}
            className={`flex-1 flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              view === key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

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

      {result?.kind === 'error' && !loading ? (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-red-500 text-center">
          予定を取得できませんでした
        </div>
      ) : view === 'calendar' ? (
        <>
          {/* 月のカレンダー */}
          <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between px-2 py-2 border-b border-gray-100">
              <button onClick={() => shiftMonth(-1)} className="p-2 text-gray-400 active:text-gray-700" aria-label="前の月">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                {cal.year}年{cal.month}月
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />}
              </span>
              <button onClick={() => shiftMonth(1)} className="p-2 text-gray-400 active:text-gray-700" aria-label="次の月">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DOW.map((d, i) => (
                <div key={d} className={`py-1.5 text-center text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 p-1">
              {cells.map((day, idx) => {
                if (day === null) return <div key={idx} className="h-14" />
                const ds = toDateStr(cal.year, cal.month, day)
                const list = byDate.get(ds) ?? []
                const isSel = ds === selected
                const isToday = ds === today
                const dow = idx % 7
                const hasMine = list.some((e) => e.mine)
                return (
                  <button
                    key={idx}
                    onClick={() => setSelected(ds)}
                    className={`relative flex flex-col items-center justify-start pt-1.5 h-14 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                      isSel ? 'bg-indigo-100' : isToday ? 'bg-indigo-50' : 'active:bg-gray-100'
                    }`}
                  >
                    <span className={`text-sm font-medium leading-none ${
                      isSel ? 'text-indigo-700' :
                      isRedDay(ds) ? 'text-red-500' :
                      dow === 6 ? 'text-blue-500' : 'text-gray-700'
                    }`}>
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs">{day}</span>
                      ) : day}
                    </span>
                    {list.length > 0 && (
                      <span className="mt-1.5 flex items-center gap-0.5">
                        {list.slice(0, MAX_DOTS).map((e) => (
                          <span key={e.id} className={`w-2 h-2 rounded-full ${eventTypeInfo(e.eventType).dot}`} />
                        ))}
                        {list.length > MAX_DOTS && <span className="text-[9px] leading-none text-gray-400">+</span>}
                      </span>
                    )}
                    {hasMine && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-600" aria-label="自分が参加" />
                    )}
                  </button>
                )
              })}
            </div>
            <p className="px-3 pb-2 text-[10px] text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />右上の点は自分が参加する予定がある日
            </p>
          </div>

          {/* 選んだ日の予定 */}
          <div>
            <p className={`text-xs font-bold mb-1.5 px-1 ${selected === today ? 'text-indigo-600' : isRedDay(selected) ? 'text-red-500' : 'text-gray-500'}`}>
              {dayHeading(selected, today)}
              {getJapaneseHolidayName(selected) && <span className="ml-1 font-normal">{getJapaneseHolidayName(selected)}</span>}
            </p>
            {(byDate.get(selected) ?? []).length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm px-4 py-4 text-sm text-gray-400 text-center">
                {loading ? '読みこみ中…' : filter === 'all' ? 'この日の予定はありません' : '当てはまる予定はありません'}
              </div>
            ) : (
              <div className="space-y-2">
                {byDate.get(selected)!.map((e) => <EventCard key={e.id} e={e} />)}
              </div>
            )}
          </div>

          {/* 選んだ日の利用者 */}
          <DayUsersSection accessToken={accessToken} date={selected} reloadKey={reloadKey} />
        </>
      ) : !result ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {byDate.size === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-6 text-sm text-gray-400 text-center">
              <CalendarDays className="h-6 w-6 mx-auto mb-2 text-gray-300" />
              {loading ? '読みこみ中…' : filter === 'all' ? 'この期間の予定はありません' : '当てはまる予定はありません'}
            </div>
          ) : (
            Array.from(byDate.keys()).sort().map((d) => (
              <div key={d}>
                <p className={`text-xs font-bold mb-1.5 px-1 ${d === today ? 'text-indigo-600' : isRedDay(d) ? 'text-red-500' : 'text-gray-500'}`}>
                  {dayHeading(d, today)}
                </p>
                <div className="space-y-2">
                  {byDate.get(d)!.map((e) => <EventCard key={e.id} e={e} />)}
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
            {days >= 120
              ? '4か月先まで表示しています'
              : result.kind === 'ok'
                ? `もっと先を見る（${Number(result.to.slice(5, 7))}/${Number(result.to.slice(8, 10))} まで表示中）`
                : 'もっと先を見る'}
          </button>
        </div>
      )}
    </div>
  )
}

function EventCard({ e }: { e: EventItem }) {
  const ti = eventTypeInfo(e.eventType)
  // モニタリングは札と同じ「モニタリング」を2回出さず、子の名前を見出しにする
  const childAsTitle = e.eventType === 'monitoring' && e.childNames.length > 0
  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
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
}
