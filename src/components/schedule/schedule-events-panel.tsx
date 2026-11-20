'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getJapaneseHolidayName } from '@/lib/japanese-holidays'
import { getTodayJST } from '@/lib/utils'
import { EVENT_TYPES, EVENT_TYPE_INFO, eventTypeInfo, eventTimeLabel } from '@/lib/schedule-events'
import type { CalendarEvent, ChildOption, FacilityDay, StaffOption } from './schedule-events-types'
import { ScheduleEventForm } from './schedule-event-form'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, MapPin, Users, User, Loader2 } from 'lucide-react'

/**
 * 全体スケジュール（PC）の上半分：月のカレンダーと、選んだ日の予定。
 * 日のマスを押すと、その日の予定と下のスタッフ一覧が切りかわる（URL の ?date=）。
 * 足す・直す・消すのボタンはシステム管理者にだけ出す。
 */

const DOW = ['日', '月', '火', '水', '木', '金', '土']
const MAX_IN_CELL = 3

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function withDow(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${m}月${d}日（${DOW[new Date(y, m - 1, d).getDay()]}）`
}

type Props = {
  date: string
  events: CalendarEvent[]
  facilityDays: FacilityDay[]
  childOptions: ChildOption[]
  staffOptions: StaffOption[]
  canEdit: boolean
}

export function ScheduleEventsPanel({ date, events, facilityDays, childOptions, staffOptions, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const today = getTodayJST()
  const [y, m] = date.split('-').map(Number)

  const [form, setForm] = useState<{ editing: CalendarEvent | null; initialDate: string | null } | null>(null)
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const go = (d: string) => startTransition(() => router.push(`/schedule?date=${d}`, { scroll: false }))
  const shiftMonth = (diff: number) => {
    const dt = new Date(y, m - 1 + diff, 1)
    const first = toDateStr(dt.getFullYear(), dt.getMonth() + 1, 1)
    // 今月に戻るときは今日を選ぶ
    go(today.slice(0, 7) === first.slice(0, 7) ? today : first)
  }

  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const e of events) eventsByDate.set(e.event_date, [...(eventsByDate.get(e.event_date) ?? []), e])
  const facilityByDate = new Map<string, FacilityDay[]>()
  for (const f of facilityDays) facilityByDate.set(f.event_date, [...(facilityByDate.get(f.event_date) ?? []), f])

  const staffName = new Map(staffOptions.map((s) => [s.userId, s.name]))

  const firstDow = new Date(y, m - 1, 1).getDay()
  const lastDay = new Date(y, m, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dayEvents = eventsByDate.get(date) ?? []
  const dayFacility = facilityByDate.get(date) ?? []

  async function runDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/schedule-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: deleting.id }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setDeleteError(json.error ?? '消せませんでした')
        return
      }
      setDeleting(null)
      setNotice('予定を消しました')
      startTransition(() => router.refresh())
    } catch {
      setDeleteError('通信できませんでした。もう一度押してください')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 月の切りかえ・追加 */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" aria-label="前の月">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-lg font-bold text-gray-900 w-32 text-center">{y}年{m}月</span>
        <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" aria-label="次の月">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => go(today)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
          今日
        </button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
        {canEdit && (
          <button
            onClick={() => { setNotice(null); setForm({ editing: null, initialDate: null }) }}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            予定を追加
          </button>
        )}
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {EVENT_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${EVENT_TYPE_INFO[t].dot}`} />
            {EVENT_TYPE_INFO[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
          休業日
        </span>
      </div>

      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>}

      {/* 月のカレンダー */}
      <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-opacity ${pending ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DOW.map((d, i) => (
            <div key={d} className={`py-1.5 text-center text-xs font-semibold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} className="min-h-24 border-b border-r border-gray-100 bg-gray-50/50" />
            const ds = toDateStr(y, m, day)
            const list = eventsByDate.get(ds) ?? []
            const fac = facilityByDate.get(ds) ?? []
            const closed = fac.find((f) => f.event_type === 'closed')
            const holiday = getJapaneseHolidayName(ds)
            const dow = idx % 7
            const selected = ds === date
            const isToday = ds === today
            return (
              <button
                key={idx}
                type="button"
                onClick={() => { setNotice(null); go(ds) }}
                className={`min-h-24 border-b border-r border-gray-100 p-1 text-left align-top flex flex-col gap-0.5 transition-colors ${
                  selected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : closed ? 'bg-gray-100 hover:bg-gray-200/70' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-semibold leading-5 ${
                    isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white' :
                    dow === 0 || holiday ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
                  }`}>
                    {day}
                  </span>
                  {(holiday || closed) && (
                    <span className={`text-[10px] truncate ${closed ? 'text-gray-500' : 'text-red-500'}`}>
                      {closed ? `休業 ${closed.title}` : holiday}
                    </span>
                  )}
                </div>
                {list.slice(0, MAX_IN_CELL).map((e) => {
                  const ti = eventTypeInfo(e.event_type)
                  const label = e.event_type === 'monitoring' && e.childNames.length > 0 ? e.childNames.join('・') : e.title
                  return (
                    <span key={e.id} className={`block text-[11px] leading-4 px-1 py-px rounded-sm border-l-2 truncate ${ti.bar}`}>
                      {!e.all_day && e.start_time ? `${e.start_time.slice(0, 5)} ` : ''}
                      {label}
                    </span>
                  )
                })}
                {list.length > MAX_IN_CELL && (
                  <span className="text-[11px] text-gray-500 px-1">ほか{list.length - MAX_IN_CELL}件</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 選んだ日の予定 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{withDow(date)}の予定</h2>
          {canEdit && dayEvents.length > 0 && (
            <button
              onClick={() => { setNotice(null); setForm({ editing: null, initialDate: date }) }}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Plus className="h-4 w-4" />
              この日に追加
            </button>
          )}
        </div>
        <div className="p-3 space-y-2">
          {dayFacility.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 px-1">施設カレンダー：{f.title}</p>
          ))}
          {dayEvents.length === 0 ? (
            <div className="flex items-center justify-between px-1 py-2">
              <p className="text-sm text-gray-400">予定はありません</p>
              {canEdit && (
                <button
                  onClick={() => { setNotice(null); setForm({ editing: null, initialDate: date }) }}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  この日に追加
                </button>
              )}
            </div>
          ) : (
            dayEvents.map((e) => {
              const ti = eventTypeInfo(e.event_type)
              // モニタリングは札と同じ「モニタリング」を2回出さず、子の名前を見出しにする
              const childAsTitle = e.event_type === 'monitoring' && e.childNames.length > 0
              return (
                <div key={e.id} className={`rounded-lg border border-gray-200 border-l-4 px-3 py-2.5 ${ti.bar.split(' ').find((c) => c.startsWith('border-l-'))}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ti.chip}`}>{ti.label}</span>
                        <span className="text-sm text-gray-600">{eventTimeLabel(e)}</span>
                        <span className="text-sm font-semibold text-gray-900">{childAsTitle ? `${e.childNames.join('・')}さん` : e.title}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        {e.childNames.length > 0 && !childAsTitle && (
                          <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-gray-400" />{e.childNames.join('・')}</span>
                        )}
                        {e.location && (
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" />{e.location}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-gray-400" />
                          参加：{e.staffUserIds.length === 0 ? '全員' : e.staffUserIds.map((id) => staffName.get(id) ?? '（辞めた人）').join('・')}
                        </span>
                      </div>
                      {e.note && <p className="text-xs text-gray-500 whitespace-pre-wrap">{e.note}</p>}
                      {e.event_type === 'monitoring' && e.child_id && (
                        <Link href={`/support-plans/${e.child_id}/monitoring`} className="inline-block text-xs text-emerald-700 hover:underline">
                          この子のモニタリングを開く（児童管理と同じ予定です）
                        </Link>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setNotice(null); setForm({ editing: e, initialDate: null }) }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />直す
                        </button>
                        <button
                          onClick={() => { setDeleteError(null); setDeleting(e) }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />消す
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {form && (
        <ScheduleEventForm
          editing={form.editing}
          initialDate={form.initialDate}
          childOptions={childOptions}
          staffOptions={staffOptions}
          onClose={() => setForm(null)}
          onSaved={(d) => {
            setForm(null)
            setNotice(form.editing ? '予定を直しました' : '予定を保存しました')
            startTransition(() => {
              router.push(`/schedule?date=${d}`, { scroll: false })
              router.refresh()
            })
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!deleteBusy) setDeleting(null) }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
            <p className="text-base font-bold text-gray-900 mb-1">この予定を消しますか？</p>
            <p className="text-sm text-gray-600 mb-1">
              {withDow(deleting.event_date)} {eventTimeLabel(deleting)}
            </p>
            <p className="text-sm text-gray-800 font-medium mb-3">
              {eventTypeInfo(deleting.event_type).label}：{deleting.title}
              {deleting.childNames.length > 0 ? `（${deleting.childNames.join('・')}）` : ''}
            </p>
            <p className="text-xs text-red-600 mb-4">消すと元に戻せません。スタッフの LINE からも消えます。</p>
            {deleteError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} disabled={deleteBusy} className="flex-1 rounded-xl py-2.5 text-sm text-gray-600 border border-gray-200 disabled:opacity-50">
                やめる
              </button>
              <button
                onClick={() => void runDelete()}
                disabled={deleteBusy}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white bg-red-500 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                消す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
