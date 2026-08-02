'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLiff } from '@/hooks/use-liff'
import { getTodayJST } from '@/lib/utils'
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, Clock, Car, CalendarDays,
  ArrowRight, User, FileText, RotateCw,
} from 'lucide-react'

type StaffInfo = { name: string }

type Shift = {
  shiftType: string
  startTime: string | null
  endTime: string | null
  breakStartTime: string | null
  breakEndTime: string | null
  note: string | null
}

type TransportItem = {
  direction: 'pickup' | 'dropoff' | 'daytime_pickup' | 'daytime_dropoff'
  childName: string
  vehicleName: string | null
  departureTime: string | null
  arrivalTime: string | null
}

type EventItem = {
  id: string
  title: string
  eventType: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  note: string | null
  childNames: string[]
  assigned: boolean
}

type ScheduleData = {
  staff: StaffInfo
  date: string
  shift: Shift | null
  hasLoginAccount: boolean
  transport: TransportItem[]
  events: EventItem[]
  overtime: { actualEndTime: string | null; status: string } | null
  leave: { daysUsed: number } | null
  breaks: { start: string | null; end: string | null }[]
}

/** key は「日付#再読み込み回数」。現在のリクエストと一致するかでローディング状態を判定する */
type FetchResult =
  | { key: string; kind: 'ok'; data: ScheduleData }
  | { key: string; kind: 'notRegistered' }
  | { key: string; kind: 'apiError'; message: string }

/** 月カレンダー用（/api/liff/staff/schedule/month のレスポンス） */
type MonthDay = {
  date: string
  shiftType: string | null
  startTime: string | null
  endTime: string | null
  transportCount: number
  eventCount: number
}

type MonthData = {
  days: MonthDay[]
  overtimeRequests: { id: string; date: string; actual_end_time: string | null; status: string }[]
  leaveUsages: { id: string; date: string; days_used: number }[]
  breakRecords: { date: string; break_start: string | null; break_end: string | null }[]
  summary: { workDays: number; transportCount: number; leaveDays: number }
}

type MonthResult = { key: string; data: MonthData | null }

const DOW = ['日', '月', '火', '水', '木', '金', '土']

const SHIFT_LABELS: Record<string, { label: string; color: string }> = {
  full:      { label: '全日', color: 'bg-indigo-100 text-indigo-700' },
  morning:   { label: '午前', color: 'bg-blue-100 text-blue-700' },
  afternoon: { label: '午後', color: 'bg-teal-100 text-teal-700' },
  off:       { label: '休み', color: 'bg-gray-100 text-gray-500' },
  holiday:   { label: '有休', color: 'bg-orange-100 text-orange-700' },
}

const DIRECTION_LABELS: Record<TransportItem['direction'], { label: string; color: string }> = {
  pickup:          { label: 'お迎え',         color: 'text-blue-600' },
  dropoff:         { label: '送り',           color: 'text-orange-600' },
  daytime_pickup:  { label: 'お迎え（日中）', color: 'text-purple-600' },
  daytime_dropoff: { label: '送り（日中）',   color: 'text-purple-600' },
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  meeting:    { label: '会議',         color: 'bg-violet-100 text-violet-700' },
  monitoring: { label: 'モニタリング', color: 'bg-emerald-100 text-emerald-700' },
  external:   { label: '外部',         color: 'bg-amber-100 text-amber-700' },
  other:      { label: '予定',         color: 'bg-gray-100 text-gray-600' },
}

function addDays(dateStr: string, diff: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + diff)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function formatHeaderDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = DOW[new Date(y, m - 1, d).getDay()]
  return `${y}年${m}月${d}日（${dow}）`
}

function shiftMonth(cal: { year: number; month: number }, diff: number) {
  const dt = new Date(cal.year, cal.month - 1 + diff, 1)
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 }
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 月カレンダーのマス目（前後の空白を null で埋める） */
function buildCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const lastDay = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** 月カレンダーのマスに出すシフトの1文字表記 */
const SHIFT_MARKS: Record<string, { char: string; color: string }> = {
  full:      { char: '全', color: 'bg-indigo-100 text-indigo-700' },
  morning:   { char: '前', color: 'bg-blue-100 text-blue-700' },
  afternoon: { char: '後', color: 'bg-teal-100 text-teal-700' },
  off:       { char: '休', color: 'bg-gray-100 text-gray-400' },
  holiday:   { char: '有', color: 'bg-orange-100 text-orange-700' },
}

const OVERTIME_STATUS: Record<string, { label: string; text: string; dot: string }> = {
  approved: { label: '承認済',   text: 'text-orange-600', dot: 'bg-orange-500' },
  rejected: { label: '却下',     text: 'text-red-600',    dot: 'bg-red-400' },
  pending:  { label: '承認待ち', text: 'text-gray-400',   dot: 'bg-orange-300' },
}

function overtimeStyle(status: string) {
  return OVERTIME_STATUS[status] ?? OVERTIME_STATUS.pending
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2 px-1">
      {icon}
      {children}
    </p>
  )
}

export default function StaffSchedulePage() {
  const liffState = useLiff(process.env.NEXT_PUBLIC_LIFF_STAFF_ID)

  const today = getTodayJST()
  const [date, setDate] = useState(today)
  const [view, setView] = useState<'day' | 'month'>('day')
  const [cal, setCal] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<FetchResult | null>(null)
  const [monthResult, setMonthResult] = useState<MonthResult | null>(null)

  const accessToken = liffState.status === 'ready' ? liffState.liff.getAccessToken() : null
  const requestKey = `${date}#${reloadKey}`
  const monthKey = `${cal.year}-${cal.month}#${reloadKey}`
  // 取得済みデータのキーが現在のリクエストと一致しない間はローディング扱い
  const loadingDay = result?.key !== requestKey
  const loadingMonth = monthResult?.key !== monthKey
  const data = result?.kind === 'ok' ? result.data : null
  const monthData = monthResult?.data ?? null

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    fetch('/api/liff/staff/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, date }),
    })
      .then(async (r) => {
        const json = await r.json() as ScheduleData & { error?: string }
        if (cancelled) return
        if (r.ok) {
          setResult({ key: requestKey, kind: 'ok', data: json })
        } else if (r.status === 404) {
          setResult({ key: requestKey, kind: 'notRegistered' })
        } else {
          setResult({ key: requestKey, kind: 'apiError', message: json.error ?? `HTTP ${r.status}` })
        }
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, kind: 'apiError', message: String(e) })
      })

    return () => { cancelled = true }
  }, [accessToken, date, requestKey])

  // 月カレンダー用データ（月表示のときだけ取得）
  useEffect(() => {
    if (!accessToken || view !== 'month') return
    let cancelled = false

    fetch('/api/liff/staff/schedule/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, year: cal.year, month: cal.month }),
    })
      .then(async (r) => {
        const json = await r.json() as MonthData
        if (cancelled) return
        setMonthResult({ key: monthKey, data: r.ok ? json : null })
      })
      .catch(() => {
        if (!cancelled) setMonthResult({ key: monthKey, data: null })
      })

    return () => { cancelled = true }
  }, [accessToken, view, cal.year, cal.month, monthKey])

  // ローディング
  if (liffState.status === 'loading' || (!result && liffState.status === 'ready' && accessToken)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (liffState.status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center text-red-600">
          <AlertCircle className="h-10 w-10 mx-auto mb-2" />
          <p className="text-sm">{liffState.message}</p>
        </div>
      </div>
    )
  }

  if (!accessToken) {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">認証エラー</h1>
        <p className="text-sm text-gray-500">LINEのアクセストークンを取得できませんでした。</p>
      </div>
    )
  }

  if (result?.kind === 'apiError') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">通信エラー</h1>
        <p className="text-sm text-gray-500 mb-4">サーバーとの通信に失敗しました。</p>
        <p className="text-xs text-red-400 font-mono break-all bg-red-50 rounded p-2 mb-4">{result.message}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-full bg-indigo-600 text-white px-5 py-2 text-sm font-medium"
        >
          再読み込み
        </button>
      </div>
    )
  }

  if (result?.kind === 'notRegistered') {
    return (
      <div className="max-w-sm mx-auto px-6 pt-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">スタッフ登録が必要です</h1>
        <p className="text-sm text-gray-500 mb-4">管理者にLINE連携の設定を依頼してください。</p>
        {liffState.status === 'ready' && (
          <p className="text-xs text-gray-400 font-mono break-all">LINE ID: {liffState.lineUserId}</p>
        )}
      </div>
    )
  }

  const shiftInfo = data?.shift ? SHIFT_LABELS[data.shift.shiftType] : null
  const isOff = data?.shift?.shiftType === 'off' || data?.shift?.shiftType === 'holiday'
  const isToday = date === today
  const isTomorrow = date === addDays(today, 1)
  const hasAnything =
    !!data?.shift || (data?.transport.length ?? 0) > 0 || (data?.events.length ?? 0) > 0

  // 月表示の下に出す、その月の申請一覧（日付順）
  const monthEntries: {
    key: string
    date: string
    label: string
    dot: string
    status: string | null
    statusColor: string
  }[] = [
    ...(monthData?.leaveUsages ?? []).map((l) => ({
      key: `leave-${l.id}`,
      date: l.date,
      label: `有給${l.days_used === 0.5 ? '（半日）' : '（1日）'}`,
      dot: 'bg-green-500',
      status: null,
      statusColor: '',
    })),
    ...(monthData?.overtimeRequests ?? []).map((o) => ({
      key: `overtime-${o.id}`,
      date: o.date,
      label: `残業${o.actual_end_time ? ` ${o.actual_end_time.slice(0, 5)}まで` : ''}`,
      dot: overtimeStyle(o.status).dot,
      status: overtimeStyle(o.status).label,
      statusColor: overtimeStyle(o.status).text,
    })),
    ...(monthData?.breakRecords ?? []).map((b, i) => ({
      key: `break-${b.date}-${i}`,
      date: b.date,
      label: `中抜け ${b.break_start ?? '?'}〜${b.break_end ?? '?'}`,
      dot: 'bg-sky-400',
      status: null,
      statusColor: '',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="max-w-sm mx-auto min-h-screen bg-gray-50 pb-10">
      {/* ヘッダー */}
      <div className="bg-indigo-600 text-white px-5 pt-10 pb-5">
        <p className="text-xs text-indigo-300 mb-0.5">マイスケジュール</p>
        <h1 className="text-xl font-bold">{data?.staff.name}さん</h1>
      </div>

      {/* 日付・月ナビゲーション */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-2 py-2.5">
          <button
            onClick={() => view === 'day' ? setDate(addDays(date, -1)) : setCal(shiftMonth(cal, -1))}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label={view === 'day' ? '前の日' : '前の月'}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-800 text-sm">
            {view === 'day' ? formatHeaderDate(date) : `${cal.year}年${cal.month}月`}
          </span>
          <button
            onClick={() => view === 'day' ? setDate(addDays(date, 1)) : setCal(shiftMonth(cal, 1))}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label={view === 'day' ? '次の日' : '次の月'}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2 px-3 pb-2.5">
          <button
            onClick={() => { setDate(today); setView('day') }}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              view === 'day' && isToday ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            今日
          </button>
          <button
            onClick={() => { setDate(addDays(today, 1)); setView('day') }}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              view === 'day' && isTomorrow ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            明日
          </button>
          <button
            onClick={() => {
              const [y, m] = date.split('-').map(Number)
              setCal({ year: y, month: m })
              setView('month')
            }}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              view === 'month' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            月表示
          </button>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={view === 'day' ? loadingDay : loadingMonth}
            className="rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 disabled:opacity-50 flex items-center gap-1"
            aria-label="更新"
          >
            {(view === 'day' ? loadingDay : loadingMonth)
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 月カレンダー（有給・残業・中抜けの申請状況） */}
      {view === 'month' && (
        <div className="px-3 pt-4 space-y-5">
          <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-opacity ${loadingMonth ? 'opacity-50' : ''}`}>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DOW.map((d, i) => (
                <div
                  key={d}
                  className={`py-2 text-center text-xs font-medium ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {loadingMonth && !monthData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              </div>
            ) : (
              <div className="grid grid-cols-7 p-1">
                {buildCells(cal.year, cal.month).map((day, idx) => {
                  if (day === null) return <div key={idx} className="h-16" />
                  const dateStr = toDateStr(cal.year, cal.month, day)
                  const dayInfo = monthData?.days.find((d) => d.date === dateStr)
                  const mark = dayInfo?.shiftType ? SHIFT_MARKS[dayInfo.shiftType] : null
                  const leave = monthData?.leaveUsages.find((l) => l.date === dateStr)
                  const overtime = monthData?.overtimeRequests.find((o) => o.date === dateStr)
                  const breaks = monthData?.breakRecords.filter((b) => b.date === dateStr) ?? []
                  const isTodayCell = dateStr === today
                  const isSelected = dateStr === date
                  const dow = idx % 7
                  return (
                    <button
                      key={idx}
                      onClick={() => { setDate(dateStr); setView('day') }}
                      className={`relative flex flex-col items-center justify-start pt-1.5 h-16 rounded-xl mx-0.5 mb-0.5 transition-colors ${
                        isSelected ? 'bg-indigo-100' : isTodayCell ? 'bg-indigo-50' : 'active:bg-gray-100'
                      }`}
                    >
                      <span className={`text-sm font-medium leading-none ${
                        isSelected ? 'text-indigo-700' :
                        isTodayCell ? 'text-indigo-600' :
                        dow === 0 ? 'text-red-500' :
                        dow === 6 ? 'text-blue-500' :
                        'text-gray-700'
                      }`}>
                        {isTodayCell ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs">{day}</span>
                        ) : day}
                      </span>

                      {/* シフト（1文字） */}
                      <span className={`mt-1 h-4 min-w-4 px-1 rounded text-[10px] font-medium leading-4 ${
                        mark ? mark.color : 'text-transparent'
                      }`}>
                        {mark?.char ?? '・'}
                      </span>

                      {/* 送迎・予定・申請のドット */}
                      <div className="flex gap-0.5 mt-1">
                        {(dayInfo?.transportCount ?? 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
                        {(dayInfo?.eventCount ?? 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                        {leave && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                        {overtime && <span className={`w-1.5 h-1.5 rounded-full ${overtimeStyle(overtime.status).dot}`} />}
                        {breaks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 凡例 */}
            <div className="border-t border-gray-100 py-3 px-3 space-y-2">
              <div className="flex gap-2 justify-center flex-wrap">
                {Object.entries(SHIFT_MARKS).map(([key, m]) => (
                  <span key={key} className="flex items-center gap-1">
                    <span className={`h-4 px-1 rounded text-[10px] font-medium leading-4 ${m.color}`}>{m.char}</span>
                    <span className="text-xs text-gray-400">
                      {key === 'full' ? '全日' : key === 'morning' ? '午前' : key === 'afternoon' ? '午後' : key === 'off' ? '休み' : '有休'}
                    </span>
                  </span>
                ))}
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-xs text-gray-400">送迎</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-xs text-gray-400">予定</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-gray-400">有給</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-300" />
                  <span className="text-xs text-gray-400">残業</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-xs text-gray-400">中抜け</span>
                </span>
              </div>
            </div>
          </div>

          {/* 月のサマリー */}
          {monthData && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-2xl shadow-sm py-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">勤務日</p>
                <p className="text-lg font-bold text-gray-800">{monthData.summary.workDays}<span className="text-xs font-normal text-gray-400 ml-0.5">日</span></p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm py-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">送迎担当</p>
                <p className="text-lg font-bold text-gray-800">{monthData.summary.transportCount}<span className="text-xs font-normal text-gray-400 ml-0.5">件</span></p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm py-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">有給取得</p>
                <p className="text-lg font-bold text-gray-800">{monthData.summary.leaveDays}<span className="text-xs font-normal text-gray-400 ml-0.5">日</span></p>
              </div>
            </div>
          )}

          {monthResult && !monthData ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400 text-center">
              申請状況を取得できませんでした
            </div>
          ) : (
            <div>
              <SectionTitle icon={<FileText className="h-3.5 w-3.5" />}>
                {cal.month}月の申請一覧
              </SectionTitle>
              {monthEntries.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
                  この月の申請はありません
                </div>
              ) : (
                <div className="space-y-2">
                  {monthEntries.map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => { setDate(entry.date); setView('day') }}
                      className="w-full text-left bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 active:bg-gray-50"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${entry.dot}`} />
                      <span className="text-sm font-medium text-gray-800 w-14 shrink-0">
                        {Number(entry.date.slice(5, 7))}/{Number(entry.date.slice(8, 10))}
                      </span>
                      <span className="text-sm text-gray-700 flex-1">{entry.label}</span>
                      {entry.status && (
                        <span className={`text-xs shrink-0 ${entry.statusColor}`}>{entry.status}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-center text-xs text-gray-400">日付をタップすると、その日の詳細を表示します</p>

          <Link
            href="/liff/staff"
            className="block w-full text-center bg-white border border-indigo-200 text-indigo-600 rounded-2xl py-3.5 text-sm font-semibold shadow-sm active:opacity-80"
          >
            有給・残業・中抜けを申請する
          </Link>
        </div>
      )}

      {view === 'day' && (
      <>

      <div className={`px-3 pt-4 space-y-5 transition-opacity ${loadingDay ? 'opacity-50' : ''}`}>
        {/* シフト */}
        <div>
          <SectionTitle icon={<Clock className="h-3.5 w-3.5" />}>シフト</SectionTitle>
          {data?.shift ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${shiftInfo?.color ?? 'bg-gray-100 text-gray-500'}`}>
                  {shiftInfo?.label ?? data.shift.shiftType}
                </span>
                {!isOff && data.shift.startTime && (
                  <span className="text-sm font-medium text-gray-800">
                    {data.shift.startTime} 〜 {data.shift.endTime ?? '—'}
                  </span>
                )}
              </div>
              {!isOff && data.shift.breakStartTime && (
                <p className="text-xs text-gray-500 mt-2">
                  休憩 {data.shift.breakStartTime} 〜 {data.shift.breakEndTime ?? '—'}
                </p>
              )}
              {data.shift.note && (
                <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{data.shift.note}</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
              {data?.hasLoginAccount === false
                ? 'シフト管理の対象外です（ログインアカウント未作成）'
                : 'シフトは登録されていません'}
            </div>
          )}
        </div>

        {/* 予定・行事 */}
        <div>
          <SectionTitle icon={<CalendarDays className="h-3.5 w-3.5" />}>予定・行事</SectionTitle>
          {(data?.events.length ?? 0) === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
              予定はありません
            </div>
          ) : (
            <div className="space-y-2">
              {data!.events.map((ev) => {
                const type = EVENT_LABELS[ev.eventType] ?? EVENT_LABELS.other
                return (
                  <div key={ev.id} className="bg-white rounded-2xl shadow-sm px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${type.color}`}>{type.label}</span>
                        <span className="text-sm font-medium text-gray-900">{ev.title}</span>
                        {!ev.assigned && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">全体</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap shrink-0 pt-0.5">
                        {ev.allDay || !ev.startTime
                          ? '終日'
                          : `${ev.startTime}${ev.endTime ? `〜${ev.endTime}` : ''}`}
                      </span>
                    </div>
                    {ev.childNames.length > 0 && (
                      <p className="flex items-center gap-1 text-xs text-gray-500 mt-1.5">
                        <User className="h-3 w-3" />
                        {ev.childNames.join('、')}
                      </p>
                    )}
                    {ev.note && (
                      <p className="text-xs text-gray-500 mt-1.5 whitespace-pre-wrap">{ev.note}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 送迎担当 */}
        <div>
          <SectionTitle icon={<Car className="h-3.5 w-3.5" />}>
            送迎担当{(data?.transport.length ?? 0) > 0 && `（${data!.transport.length}件）`}
          </SectionTitle>
          {(data?.transport.length ?? 0) === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
              この日の送迎担当はありません
            </div>
          ) : (
            <div className="space-y-2">
              {data!.transport.map((item, idx) => {
                const dir = DIRECTION_LABELS[item.direction]
                return (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${dir.color}`}>{dir.label}</span>
                        <span className="text-sm font-medium text-gray-900">{item.childName}</span>
                      </div>
                      {(item.departureTime || item.arrivalTime) && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          {item.departureTime ?? '—'}
                          <ArrowRight className="h-3 w-3" />
                          {item.arrivalTime ?? '—'}
                        </span>
                      )}
                    </div>
                    {item.vehicleName && (
                      <p className="flex items-center gap-1 text-xs text-gray-500 mt-1.5">
                        <Car className="h-3 w-3" />
                        {item.vehicleName}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 申請状況 */}
        {(data?.leave || data?.overtime || (data?.breaks.length ?? 0) > 0) && (
          <div>
            <SectionTitle icon={<FileText className="h-3.5 w-3.5" />}>申請状況</SectionTitle>
            <div className="space-y-2">
              {data?.leave && (
                <div className="flex items-center gap-2.5 bg-green-50 rounded-2xl px-4 py-3 border border-green-100">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-sm text-green-800 font-medium">
                    有給取得済み{data.leave.daysUsed === 0.5 ? '（半日）' : '（1日）'}
                  </span>
                </div>
              )}
              {data?.overtime && (
                <div className="flex items-center gap-2.5 rounded-2xl px-4 py-3 border bg-orange-50 border-orange-100">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    data.overtime.status === 'approved' ? 'bg-orange-500' :
                    data.overtime.status === 'rejected' ? 'bg-red-400' : 'bg-orange-300'
                  }`} />
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">残業申請</span>
                    {data.overtime.actualEndTime && (
                      <span className="text-gray-500 ml-1">{data.overtime.actualEndTime}まで</span>
                    )}
                    <span className={`ml-2 text-xs ${
                      data.overtime.status === 'approved' ? 'text-orange-600' :
                      data.overtime.status === 'rejected' ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {data.overtime.status === 'approved' ? '承認済' :
                       data.overtime.status === 'rejected' ? '却下' : '承認待ち'}
                    </span>
                  </div>
                </div>
              )}
              {data?.breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100">
                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  <span className="text-sm text-sky-800 font-medium">
                    中抜け {b.start ?? '?'}〜{b.end ?? '?'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAnything && (
          <p className="text-center text-xs text-gray-400 pt-2">この日の予定は登録されていません</p>
        )}

        {/* 申請ページへ */}
        <Link
          href="/liff/staff"
          className="block w-full text-center bg-white border border-indigo-200 text-indigo-600 rounded-2xl py-3.5 text-sm font-semibold shadow-sm active:opacity-80"
        >
          有給・残業・中抜けを申請する
        </Link>
      </div>
      </>
      )}
    </div>
  )
}
