'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Clock, Plus, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  TransportScheduleRaw,
  StaffShiftRaw,
  AttendanceRaw,
  MonitoringRaw,
  CustomEventRaw,
} from '@/app/(dashboard)/schedule/page'

// ─── 統合イベント型 ───────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string
  date: string
  startTime: string | null  // "HH:MM"
  endTime: string | null
  title: string
  subtitle?: string
  type: 'transport_pickup' | 'transport_dropoff' | 'shift' | 'attendance' | 'monitoring' | 'meeting' | 'monitoring_event' | 'external' | 'other'
  color: string  // Tailwind bg class
  textColor: string
  allDay?: boolean
}

// ─── カラー定義 ───────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<CalendarEvent['type'], { bg: string; text: string }> = {
  transport_pickup:   { bg: 'bg-blue-500',   text: 'text-white' },
  transport_dropoff:  { bg: 'bg-orange-500', text: 'text-white' },
  shift:              { bg: 'bg-indigo-400', text: 'text-white' },
  attendance:         { bg: 'bg-yellow-400', text: 'text-gray-800' },
  monitoring:         { bg: 'bg-green-500',  text: 'text-white' },
  meeting:            { bg: 'bg-gray-500',   text: 'text-white' },
  monitoring_event:   { bg: 'bg-teal-500',   text: 'text-white' },
  external:           { bg: 'bg-purple-500', text: 'text-white' },
  other:              { bg: 'bg-pink-400',   text: 'text-white' },
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting:           '職員面接・会議',
  monitoring_event:  'モニタリング',
  external:          '外部機関連絡',
  other:             'その他',
}

// ─── データを統合イベントへ変換 ────────────────────────────────────────────────

function buildEvents(
  transport: TransportScheduleRaw[],
  shifts: StaffShiftRaw[],
  users: { id: string; name: string }[],
  attendance: AttendanceRaw[],
  monitoring: MonitoringRaw[],
  custom: CustomEventRaw[],
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  // 送迎
  for (const sched of transport) {
    const type = sched.direction === 'pickup' ? 'transport_pickup' : 'transport_dropoff'
    const col = EVENT_COLORS[type]
    const vehicle = sched.transport_vehicles?.name ?? ''
    const driver  = sched.staff_members?.name ?? ''

    // 個々の子どもの pickup_time があればそれを使い、なければ departure_time
    const details = sched.transport_details ?? []
    if (details.length === 0) continue

    // 同じ時刻ごとにグループ化
    const byTime = new Map<string, typeof details>()
    for (const td of details) {
      const t = td.pickup_time?.slice(0, 5) ?? sched.departure_time?.slice(0, 5) ?? null
      const key = t ?? '__none__'
      if (!byTime.has(key)) byTime.set(key, [])
      byTime.get(key)!.push(td)
    }

    for (const [timeKey, tds] of byTime) {
      const t = timeKey === '__none__' ? null : timeKey
      const names = tds.map((td) => td.children?.name ?? '').filter(Boolean).join('、')
      const sub = [vehicle && `${vehicle}`, driver && `担当:${driver}`].filter(Boolean).join(' ')
      events.push({
        id: `transport-${sched.id}-${timeKey}`,
        date: sched.date,
        startTime: t,
        endTime: null,
        title: `${sched.direction === 'pickup' ? '迎え' : '帰り'} ${names}`,
        subtitle: sub || undefined,
        type,
        color: col.bg,
        textColor: col.text,
      })
    }
  }

  // シフト
  for (const s of shifts) {
    const col = EVENT_COLORS.shift
    const name = userMap.get(s.staff_id) ?? '—'
    events.push({
      id: `shift-${s.id}`,
      date: s.date,
      startTime: s.start_time?.slice(0, 5) ?? null,
      endTime: s.end_time?.slice(0, 5) ?? null,
      title: name,
      subtitle: s.break_start_time ? `中抜け ${s.break_start_time.slice(0, 5)}〜${s.break_end_time?.slice(0, 5) ?? ''}` : undefined,
      type: 'shift',
      color: col.bg,
      textColor: col.text,
    })
  }

  // 子どもの利用予定（終日）
  const attendanceByDate = new Map<string, string[]>()
  for (const a of attendance) {
    if (!attendanceByDate.has(a.date)) attendanceByDate.set(a.date, [])
    const name = a.children?.name
    if (name) attendanceByDate.get(a.date)!.push(name)
  }
  for (const [date, names] of attendanceByDate) {
    const col = EVENT_COLORS.attendance
    events.push({
      id: `attendance-${date}`,
      date,
      startTime: null,
      endTime: null,
      title: `通所 ${names.length}名`,
      subtitle: names.join('・'),
      type: 'attendance',
      color: col.bg,
      textColor: col.text,
      allDay: true,
    })
  }

  // モニタリング記録
  for (const m of monitoring) {
    const col = EVENT_COLORS.monitoring
    events.push({
      id: `monitoring-${m.id}`,
      date: m.record_date,
      startTime: null,
      endTime: null,
      title: `モニタリング ${m.children?.name ?? ''}`,
      type: 'monitoring',
      color: col.bg,
      textColor: col.text,
      allDay: true,
    })
  }

  // カスタムイベント
  for (const c of custom) {
    const type = c.event_type === 'monitoring' ? 'monitoring_event' : (c.event_type as CalendarEvent['type'])
    const col = EVENT_COLORS[type] ?? EVENT_COLORS.other
    events.push({
      id: `custom-${c.id}`,
      date: c.event_date,
      startTime: c.start_time?.slice(0, 5) ?? null,
      endTime: c.end_time?.slice(0, 5) ?? null,
      title: c.title,
      subtitle: c.children?.name,
      type,
      color: col.bg,
      textColor: col.text,
      allDay: c.all_day,
    })
  }

  return events
}

// ─── 時刻 → 分 ────────────────────────────────────────────────────────────────

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

// タイムゾーン非依存の日付フォーマット（toISOString はUTC変換でJSTと1日ズレる）
function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  date: string
  view: 'day' | 'week' | 'month'
  transportSchedules: TransportScheduleRaw[]
  staffShifts: StaffShiftRaw[]
  users: { id: string; name: string }[]
  attendance: AttendanceRaw[]
  monitoringRecords: MonitoringRaw[]
  customEvents: CustomEventRaw[]
  units: { id: string; name: string }[]
  facilityId: string | null
  children: { id: string; name: string }[]
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export function ScheduleBoard({
  date,
  view,
  transportSchedules,
  staffShifts,
  users,
  attendance,
  monitoringRecords,
  customEvents,
  facilityId,
  children,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const supabase = createClient()

  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    title: '',
    event_type: 'other' as 'meeting' | 'monitoring_event' | 'external' | 'other',
    event_date: date,
    start_time: '',
    end_time: '',
    all_day: false,
    note: '',
    child_id: '',
  })

  const allEvents = buildEvents(
    transportSchedules, staffShifts, users, attendance, monitoringRecords, customEvents,
  )

  const [y, m, d] = date.split('-').map(Number)

  function navigate(delta: number) {
    let nd: Date
    if (view === 'day')   nd = new Date(y, m - 1, d + delta)
    else if (view === 'week') nd = new Date(y, m - 1, d + delta * 7)
    else                  nd = new Date(y, m - 1 + delta, 1)
    startTransition(() => router.push(`/schedule?date=${localDateStr(nd)}&view=${view}`))
  }

  function setView(v: 'day' | 'week' | 'month') {
    startTransition(() => router.push(`/schedule?date=${date}&view=${v}`))
  }

  function goToDate(d: string) {
    startTransition(() => router.push(`/schedule?date=${d}&view=day`))
  }

  async function handleSaveEvent() {
    if (!addForm.title || !addForm.event_date) return
    setSaving(true)
    await supabase.from('schedule_events').insert({
      facility_id: facilityId,
      title: addForm.title,
      event_type: addForm.event_type === 'monitoring_event' ? 'monitoring' : addForm.event_type,
      event_date: addForm.event_date,
      start_time: addForm.all_day ? null : (addForm.start_time || null),
      end_time: addForm.all_day ? null : (addForm.end_time || null),
      all_day: addForm.all_day,
      note: addForm.note || null,
      child_id: (addForm.event_type === 'monitoring_event' && addForm.child_id) ? addForm.child_id : null,
    })
    setSaving(false)
    setShowAddForm(false)
    setAddForm({ title: '', event_type: 'other', event_date: date, start_time: '', end_time: '', all_day: false, note: '', child_id: '' })
    startTransition(() => router.refresh())
  }

  async function handleDeleteCustomEvent(eventId: string) {
    const rawId = eventId.replace('custom-', '')
    if (!confirm('このイベントを削除しますか？')) return
    await supabase.from('schedule_events').delete().eq('id', rawId)
    startTransition(() => router.refresh())
  }

  const headerLabel = view === 'day'
    ? `${y}年${m}月${d}日`
    : view === 'week'
    ? `${y}年${m}月${d}日〜`
    : `${y}年${m}月`

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">全体スケジュール</h1>
          <p className="text-sm text-gray-500 mt-0.5">送迎・シフト・モニタリング・イベントの一覧</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* ビュー切替 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {([['day', '日', Clock], ['week', '週', CalendarRange], ['month', '月', CalendarDays]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 transition-colors',
                  view === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {/* ナビ */}
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold min-w-[120px] text-center">{headerLabel}</span>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          {/* 今日 */}
          <button
            onClick={() => startTransition(() => router.push(`/schedule?date=${localDateStr(new Date())}&view=${view}`))}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
          >今日</button>
          {/* 追加 */}
          <button
            onClick={() => { setAddForm((f) => ({ ...f, event_date: date })); setShowAddForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            イベント追加
          </button>
        </div>
      </div>

      {/* イベント追加フォーム */}
      {showAddForm && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-800">イベントを追加</p>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-500 mb-1 block">タイトル *</label>
              <input
                type="text"
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                placeholder="イベント名"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">種別</label>
              <select
                value={addForm.event_type}
                onChange={(e) => setAddForm({ ...addForm, event_type: e.target.value as typeof addForm.event_type })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">日付 *</label>
              <input
                type="date"
                value={addForm.event_date}
                onChange={(e) => setAddForm({ ...addForm, event_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {addForm.event_type === 'monitoring_event' && (
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs text-gray-500 mb-1 block">対象児童</label>
                <select
                  value={addForm.child_id}
                  onChange={(e) => setAddForm({ ...addForm, child_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">選択してください</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={addForm.all_day}
                onChange={(e) => setAddForm({ ...addForm, all_day: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600"
              />
              終日
            </label>
            {!addForm.all_day && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">開始</label>
                  <input
                    type="time"
                    value={addForm.start_time}
                    onChange={(e) => setAddForm({ ...addForm, start_time: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">終了</label>
                  <input
                    type="time"
                    value={addForm.end_time}
                    onChange={(e) => setAddForm({ ...addForm, end_time: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
            <input
              type="text"
              value={addForm.note}
              onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
              placeholder="補足など"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSaveEvent()}
              disabled={saving || !addForm.title || !addForm.event_date}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">キャンセル</button>
          </div>
        </div>
      )}

      {/* ビュー本体 */}
      {view === 'day' && (
        <DayView
          date={date}
          events={allEvents.filter((e) => e.date === date)}
          transportSchedules={transportSchedules.filter((t) => t.date === date)}
          onDeleteCustom={handleDeleteCustomEvent}
        />
      )}
      {view === 'week' && (
        <WeekView anchorDate={date} events={allEvents} onDateClick={goToDate} onDeleteCustom={handleDeleteCustomEvent} />
      )}
      {view === 'month' && (
        <MonthView year={y} month={m} events={allEvents} onDateClick={goToDate} />
      )}

      {/* 凡例 */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        {([
          ['transport_pickup', '迎え送迎'],
          ['transport_dropoff', '帰り送迎'],
          ['shift', 'シフト'],
          ['attendance', '通所予定'],
          ['monitoring', 'モニタリング記録'],
          ['meeting', '職員面接・会議'],
          ['monitoring_event', 'モニタリング予定'],
          ['external', '外部機関連絡'],
          ['other', 'その他'],
        ] as [CalendarEvent['type'], string][]).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={cn('w-3 h-3 rounded', EVENT_COLORS[type].bg)} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 日表示（タイムライン） ────────────────────────────────────────────────────

const HOUR_START  = 7
const HOUR_END    = 21
const HOUR_HEIGHT = 64  // px per hour

function timeToPx(time: string): number {
  return Math.max(0, ((toMin(time) - HOUR_START * 60) / 60) * HOUR_HEIGHT)
}

function durationPx(start: string, end: string | null): number {
  if (!end) return 28
  return Math.max(28, ((toMin(end) - toMin(start)) / 60) * HOUR_HEIGHT)
}

/** 重複イベントを横並びにレイアウトする */
function layoutEvents(events: CalendarEvent[]): { event: CalendarEvent; leftPct: number; widthPct: number }[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  const colEnds: number[] = []
  const withCol: { event: CalendarEvent; col: number }[] = []

  for (const ev of sorted) {
    const s = toMin(ev.startTime ?? '00:00')
    const e = ev.endTime ? toMin(ev.endTime) : s + 30
    let col = colEnds.findIndex((end) => end <= s)
    if (col === -1) { col = colEnds.length; colEnds.push(e) }
    else colEnds[col] = e
    withCol.push({ event: ev, col })
  }

  const total = Math.max(1, colEnds.length)
  return withCol.map(({ event, col }) => ({
    event,
    leftPct: (col / total) * 100,
    widthPct: 100 / total,
  }))
}

function DayView({ date, events, transportSchedules, onDeleteCustom }: {
  date: string
  events: CalendarEvent[]
  transportSchedules: TransportScheduleRaw[]
  onDeleteCustom: (id: string) => void
}) {
  const totalHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT

  // ── 列1: 利用者 ── 送迎データから子どもごとの利用時間を組み立てる
  const childMap = new Map<string, { name: string; startTime: string | null; endTime: string | null }>()
  for (const sched of transportSchedules) {
    for (const detail of sched.transport_details ?? []) {
      if (!childMap.has(detail.child_id)) {
        childMap.set(detail.child_id, { name: detail.children?.name ?? '—', startTime: null, endTime: null })
      }
      const c = childMap.get(detail.child_id)!
      const t = detail.pickup_time?.slice(0, 5) ?? sched.departure_time?.slice(0, 5) ?? null
      if (sched.direction === 'pickup') c.startTime = t
      else c.endTime = t
    }
  }
  const childSchedules = [...childMap.values()].sort(
    (a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')
  )
  // 送迎データに乗っていない通所予定の子ども（終日表示に回す）
  const transportChildIds = new Set(childMap.keys())
  const attendanceEvent = events.find((e) => e.type === 'attendance')

  // ── 列2: 送迎（送迎のみ）──
  const transportEvents = events.filter(
    (e) => (e.type === 'transport_pickup' || e.type === 'transport_dropoff') && e.startTime
  )
  const col2Events = layoutEvents(transportEvents)

  // ── 列3: 予定・行事（モニタリング予定・会議・外部機関連絡・その他）──
  const planTimedEvents = events.filter(
    (e) => ['monitoring_event', 'meeting', 'external', 'other'].includes(e.type)
      && e.startTime && !e.allDay
  )
  const col3Events = layoutEvents(planTimedEvents)

  // ── 列4: スタッフシフト ──
  const shiftEvents = events.filter((e) => e.type === 'shift' && e.startTime)
  const col4Events  = layoutEvents(shiftEvents)

  // ── 終日エリア: 通所予定・モニタリング記録・カスタム終日 ──
  const allDayEvents = events.filter(
    (e) => e.allDay || (!e.startTime && !['shift'].includes(e.type))
  )

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 終日イベント帯 */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-gray-100 px-3 py-2 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400 shrink-0">終日</span>
          {allDayEvents.map((e) => (
            <EventChip key={e.id} event={e} onDelete={e.id.startsWith('custom-') ? onDeleteCustom : undefined} />
          ))}
        </div>
      )}

      {/* 3列タイムライン */}
      <div className="flex overflow-x-auto">
        {/* 時刻軸 */}
        <div className="w-12 shrink-0 border-r border-gray-100">
          <div className="h-8 border-b border-gray-100" />
          <div className="relative" style={{ height: totalHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 text-xs text-gray-400 leading-none select-none"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>
        </div>

        {/* 列1: 利用者 */}
        <TimelineColumn label="利用者" headerCls="bg-yellow-50 text-yellow-700 border-yellow-100" totalHeight={totalHeight}>
          {childSchedules.map((child, idx) => {
            if (!child.startTime) return null
            const top = timeToPx(child.startTime)
            const h   = child.endTime ? durationPx(child.startTime, child.endTime) : 28
            return (
              <div
                key={idx}
                className="absolute left-1 right-1 rounded px-1 py-0.5 bg-yellow-100 border border-yellow-300 overflow-hidden"
                style={{ top, height: h }}
              >
                <div className="text-xs font-semibold text-yellow-800 truncate">{child.name}</div>
                <div className="text-xs text-yellow-600">
                  {child.startTime}{child.endTime ? `〜${child.endTime}` : ''}
                </div>
              </div>
            )
          })}
          {/* 送迎なしの通所児童を下部に表示 */}
          {attendanceEvent && !transportChildIds.size && (
            <div className="absolute bottom-0 left-1 right-1 text-xs text-gray-400 truncate">{attendanceEvent.title}</div>
          )}
        </TimelineColumn>

        {/* 列2: 送迎 */}
        <TimelineColumn label="送迎" headerCls="bg-blue-50 text-blue-700 border-blue-100" totalHeight={totalHeight}>
          {col2Events.map(({ event: e, leftPct, widthPct }) => (
            <div
              key={e.id}
              className={cn('absolute rounded px-1 py-0.5 text-xs overflow-hidden group border border-white/30', e.color, e.textColor)}
              style={{ top: timeToPx(e.startTime!), height: durationPx(e.startTime!, e.endTime), left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
            >
              <div className="font-semibold truncate leading-tight">{e.title}</div>
              {e.subtitle && <div className="opacity-80 truncate text-xs">{e.subtitle}</div>}
              <div className="opacity-70 text-xs">{e.startTime}</div>
            </div>
          ))}
          {col2Events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">送迎なし</div>
          )}
        </TimelineColumn>

        {/* 列3: 予定・行事（モニタリング・会議・外部等） */}
        <TimelineColumn label="予定・行事" headerCls="bg-teal-50 text-teal-700 border-teal-100" totalHeight={totalHeight}>
          {col3Events.map(({ event: e, leftPct, widthPct }) => (
            <div
              key={e.id}
              className={cn('absolute rounded px-1 py-0.5 text-xs overflow-hidden group border border-white/30', e.color, e.textColor)}
              style={{ top: timeToPx(e.startTime!), height: durationPx(e.startTime!, e.endTime), left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
            >
              <div className="font-semibold truncate leading-tight">{e.title}</div>
              {e.subtitle && <div className="opacity-80 truncate text-xs">{e.subtitle}</div>}
              <div className="opacity-70 text-xs">{e.startTime}{e.endTime ? `〜${e.endTime}` : ''}</div>
              {e.id.startsWith('custom-') && (
                <button onClick={() => onDeleteCustom(e.id)} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {col3Events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">予定なし</div>
          )}
        </TimelineColumn>

        {/* 列4: スタッフ */}
        <TimelineColumn label="スタッフ" headerCls="bg-indigo-50 text-indigo-700 border-indigo-100" totalHeight={totalHeight} isLast>
          {col4Events.map(({ event: e, leftPct, widthPct }) => (
            <div
              key={e.id}
              className={cn('absolute rounded px-1 py-0.5 text-xs overflow-hidden border border-white/30', e.color, e.textColor)}
              style={{ top: timeToPx(e.startTime!), height: durationPx(e.startTime!, e.endTime), left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)` }}
            >
              <div className="font-semibold truncate leading-tight">{e.title}</div>
              <div className="opacity-70 text-xs">{e.startTime}〜{e.endTime ?? ''}</div>
              {e.subtitle && <div className="opacity-80 truncate text-xs">{e.subtitle}</div>}
            </div>
          ))}
        </TimelineColumn>
      </div>
    </div>
  )
}

// ─── TimelineColumn ────────────────────────────────────────────────────────────

function TimelineColumn({ label, headerCls, totalHeight, children, isLast }: {
  label: string
  headerCls: string
  totalHeight: number
  children: React.ReactNode
  isLast?: boolean
}) {
  return (
    <div className={cn('flex-1 min-w-[160px]', !isLast && 'border-r border-gray-100')}>
      <div className={cn('h-8 border-b px-2 flex items-center text-xs font-semibold', headerCls)}>
        {label}
      </div>
      <div className="relative" style={{ height: totalHeight }}>
        {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
          <div key={i} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: i * HOUR_HEIGHT }} />
        ))}
        {children}
      </div>
    </div>
  )
}

// ─── 週表示 ────────────────────────────────────────────────────────────────────

const DAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土']

function WeekView({ anchorDate, events, onDateClick, onDeleteCustom }: {
  anchorDate: string
  events: CalendarEvent[]
  onDateClick: (date: string) => void
  onDeleteCustom: (id: string) => void
}) {
  const anchor = new Date(anchorDate)
  const dow = anchor.getDay()
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor)
    d.setDate(anchor.getDate() - dow + i)
    return localDateStr(d)
  })

  const today = localDateStr(new Date())

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDates.map((d, i) => {
          const [, , day] = d.split('-')
          const isToday = d === today
          return (
            <button
              key={d}
              onClick={() => onDateClick(d)}
              className={cn(
                'py-2 text-center text-sm font-medium border-r last:border-0 border-gray-100 hover:bg-indigo-50',
                isToday && 'bg-indigo-50',
              )}
            >
              <div className={cn(
                'text-xs mb-0.5',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              )}>
                {DAY_LABELS_JA[i]}
              </div>
              <div className={cn(
                'mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm',
                isToday ? 'bg-indigo-600 text-white' : 'text-gray-800'
              )}>
                {parseInt(day)}
              </div>
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-h-40">
        {weekDates.map((d, i) => {
          const dayEvents = events.filter((e) => e.date === d)
          return (
            <div
              key={d}
              className={cn('border-r last:border-0 border-gray-100 p-1 space-y-0.5 cursor-pointer hover:bg-gray-50/50', i === 0 && 'bg-red-50/20', i === 6 && 'bg-blue-50/20')}
              onClick={() => onDateClick(d)}
            >
              {dayEvents.slice(0, 5).map((e) => (
                <div key={e.id} className={cn('text-xs px-1 rounded truncate', e.color, e.textColor)}>
                  {e.startTime ? `${e.startTime} ` : ''}{e.title}
                </div>
              ))}
              {dayEvents.length > 5 && (
                <div className="text-xs text-gray-400 pl-1">+{dayEvents.length - 5}件</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 月表示 ────────────────────────────────────────────────────────────────────

function MonthView({ year, month, events, onDateClick }: {
  year: number
  month: number
  events: CalendarEvent[]
  onDateClick: (date: string) => void
}) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const cells = Array.from({ length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 }, (_, i) => {
    const dayNum = i - startPad + 1
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  })

  const today = localDateStr(new Date())

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {DAY_LABELS_JA.map((l, i) => (
          <div key={l} className={cn('text-center text-xs font-medium py-2', i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500')}>
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, idx) => {
          if (!d) return <div key={idx} className="h-24 border-b border-r border-gray-50" />
          const dayEvents = events.filter((e) => e.date === d)
          const dow = new Date(d).getDay()
          const isToday = d === today
          return (
            <div
              key={d}
              onClick={() => onDateClick(d)}
              className={cn(
                'h-24 border-b border-r border-gray-50 p-1 cursor-pointer hover:bg-indigo-50 overflow-hidden',
                isToday && 'bg-indigo-50',
              )}
            >
              <div className={cn(
                'text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full',
                isToday ? 'bg-indigo-600 text-white' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
              )}>
                {parseInt(d.split('-')[2])}
              </div>
              {dayEvents.slice(0, 3).map((e) => (
                <div key={e.id} className={cn('text-xs px-1 rounded truncate mb-0.5', e.color, e.textColor)}>
                  {e.startTime ? `${e.startTime} ` : ''}{e.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-xs text-gray-400">+{dayEvents.length - 3}件</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── EventChip ────────────────────────────────────────────────────────────────

function EventChip({ event, onDelete }: { event: CalendarEvent; onDelete?: (id: string) => void }) {
  return (
    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs group', event.color, event.textColor)}>
      <span className="truncate max-w-40">{event.title}</span>
      {onDelete && (
        <button onClick={() => onDelete(event.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
