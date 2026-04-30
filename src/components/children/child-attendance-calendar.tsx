'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Car, Clock, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type AttendanceRecord = {
  id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
  units: { name: string } | null
}

interface Props {
  year: number
  month: number
  childId: string
  attendances: AttendanceRecord[]
  basePath?: string
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function fmt(time: string | null | undefined) {
  return time ? time.slice(0, 5) : null
}

function TimeRow({ label, start, end }: { label: string; start: string | null; end: string | null }) {
  if (!start && !end) return null
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-800">
        {start ?? '—'}{start && end ? ' 〜 ' : ''}{end ?? ''}
      </span>
    </div>
  )
}

export function ChildAttendanceCalendar({ year, month, childId, attendances, basePath }: Props) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const changeMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1)
    const path = basePath ?? `/children/${childId}/schedule`
    router.push(`${path}?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
    setSelectedDate(null)
  }

  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const cells = Array.from(
    { length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 },
    (_, i) => {
      const dayNum = i - startPad + 1
      if (dayNum < 1 || dayNum > lastDay.getDate()) return null
      return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    }
  )

  const attendanceMap = Object.fromEntries(attendances.map((a) => [a.date, a]))
  const today = new Date().toISOString().slice(0, 10)
  const selected = selectedDate ? (attendanceMap[selectedDate] ?? null) : null

  return (
    <div className="space-y-3">
      {/* 月ナビ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">{year}年{month}月の出席記録</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={cn(
                'text-center text-xs font-medium py-2',
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} className="h-12 border-b border-r border-gray-50" />
            const att = attendanceMap[date]
            const isToday = date === today
            const isSelected = date === selectedDate
            const dow = new Date(date).getDay()
            const isAttended = att?.status === 'attended'
            const isAbsent = att?.status === 'absent'

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                className={cn(
                  'h-12 border-b border-r border-gray-50 p-1 flex flex-col items-center transition-colors hover:bg-indigo-50',
                  isSelected && 'bg-indigo-100 ring-1 ring-inset ring-indigo-400'
                )}
              >
                <div
                  className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : dow === 0
                      ? 'text-red-500'
                      : dow === 6
                      ? 'text-blue-500'
                      : 'text-gray-700'
                  )}
                >
                  {new Date(date).getDate()}
                </div>
                {isAttended && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />}
                {isAbsent && <div className="w-1.5 h-1.5 rounded-full bg-red-300 mt-0.5" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />出席
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-300" />欠席
        </div>
      </div>

      {/* 日付詳細パネル */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </h3>
            {selected ? (
              <Badge variant={selected.status === 'attended' ? 'success' : 'secondary'}>
                {selected.status === 'attended' ? '出席' : '欠席'}
              </Badge>
            ) : (
              <span className="text-xs text-gray-400">記録なし</span>
            )}
          </div>

          {!selected ? (
            <p className="text-sm text-gray-400 text-center py-2">この日の出席記録がありません</p>
          ) : (
            <div className="space-y-3">
              {/* ユニット */}
              {selected.units?.name && (
                <p className="text-xs text-gray-500">ユニット: {selected.units.name}</p>
              )}

              {/* 送迎時間 */}
              {(selected.pickup_departure_time ||
                selected.pickup_arrival_time ||
                selected.dropoff_departure_time ||
                selected.dropoff_arrival_time) && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-xs font-semibold text-gray-600">送迎時間</span>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-2.5 space-y-1">
                    <TimeRow
                      label="お迎え出発"
                      start={fmt(selected.pickup_departure_time)}
                      end={null}
                    />
                    <TimeRow
                      label="事務所到着"
                      start={fmt(selected.pickup_arrival_time)}
                      end={null}
                    />
                    <TimeRow
                      label="事務所出発"
                      start={fmt(selected.dropoff_departure_time)}
                      end={null}
                    />
                    <TimeRow
                      label="自宅到着"
                      start={fmt(selected.dropoff_arrival_time)}
                      end={null}
                    />
                  </div>
                </div>
              )}

              {/* 提供時間 */}
              {(selected.service_start_time || selected.service_end_time) && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-gray-600">提供時間</span>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-800">
                      {fmt(selected.service_start_time) ?? '—'} 〜 {fmt(selected.service_end_time) ?? '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* 日中一時利用 */}
              {selected.daytime_support && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold text-gray-600">日中一時利用</span>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2.5">
                    <span className="text-sm text-gray-800">
                      {fmt(selected.daytime_support_start_time) ?? '—'} 〜 {fmt(selected.daytime_support_end_time) ?? '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
