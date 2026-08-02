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
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<FetchResult | null>(null)

  const accessToken = liffState.status === 'ready' ? liffState.liff.getAccessToken() : null
  const requestKey = `${date}#${reloadKey}`
  // 取得済みデータのキーが現在のリクエストと一致しない間はローディング扱い
  const loadingDay = result?.key !== requestKey
  const data = result?.kind === 'ok' ? result.data : null

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

  return (
    <div className="max-w-sm mx-auto min-h-screen bg-gray-50 pb-10">
      {/* ヘッダー */}
      <div className="bg-indigo-600 text-white px-5 pt-10 pb-5">
        <p className="text-xs text-indigo-300 mb-0.5">マイスケジュール</p>
        <h1 className="text-xl font-bold">{data?.staff.name}さん</h1>
      </div>

      {/* 日付ナビゲーション */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-2 py-2.5">
          <button
            onClick={() => setDate(addDays(date, -1))}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label="前の日"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-800 text-sm">{formatHeaderDate(date)}</span>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-2 text-gray-400 hover:text-gray-700"
            aria-label="次の日"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2 px-3 pb-2.5">
          <button
            onClick={() => setDate(today)}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              isToday ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            今日
          </button>
          <button
            onClick={() => setDate(addDays(today, 1))}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
              isTomorrow ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            明日
          </button>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loadingDay}
            className="rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 disabled:opacity-50 flex items-center gap-1"
          >
            {loadingDay
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCw className="h-3.5 w-3.5" />}
            更新
          </button>
        </div>
      </div>

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
    </div>
  )
}
