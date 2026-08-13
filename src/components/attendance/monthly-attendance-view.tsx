'use client'

import { getTodayJST } from '@/lib/utils'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { Unit } from './attendance-board'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** この人数以上の日は赤く表示して定員オーバーを警告する */
export const CROWDED_THRESHOLD = 16

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type MonthReservation = {
  id: string
  child_id: string
  date: string
  status: string
  children: { id: string; name: string; name_kana: string | null } | null
}

type MonthAttendance = {
  child_id: string
  date: string
  status: string
}

export function MonthlyAttendanceView({
  baseDate,
  selectedUnitId,
  units,
}: {
  baseDate: string
  selectedUnitId: string
  units: Unit[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const today = getTodayJST()

  const [monthOffset, setMonthOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<MonthReservation[]>([])
  const [attendances, setAttendances] = useState<MonthAttendance[]>([])

  const base = new Date(baseDate + 'T00:00:00')
  const firstDay = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  const monthStart = toDateStr(firstDay)
  const monthEnd = toDateStr(lastDay)
  const monthLabel = `${firstDay.getFullYear()}年${firstDay.getMonth() + 1}月`

  useEffect(() => {
    if (!selectedUnitId) return
    setLoading(true)

    Promise.all([
      supabase
        .from('usage_reservations')
        .select('id, child_id, date, status, children(id, name, name_kana)')
        .eq('unit_id', selectedUnitId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .in('status', ['confirmed', 'reserved', 'cancel_waiting']),
      supabase
        .from('daily_attendance')
        .select('child_id, date, status')
        .eq('unit_id', selectedUnitId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
    ]).then(([{ data: resData }, { data: attData }]) => {
      setReservations((resData ?? []) as unknown as MonthReservation[])
      setAttendances((attData ?? []) as unknown as MonthAttendance[])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId, monthStart])

  const attMap = new Map(attendances.map((a) => [`${a.child_id}-${a.date}`, a]))

  // 日付ごとの利用児童（キャンセル待ち・欠席記録を除いた実利用）
  type DayEntry = { id: string; childId: string; name: string; absent: boolean }
  const dayMap = new Map<string, { entries: DayEntry[]; count: number; absentCount: number }>()

  for (const r of reservations) {
    let day = dayMap.get(r.date)
    if (!day) {
      day = { entries: [], count: 0, absentCount: 0 }
      dayMap.set(r.date, day)
    }
    if (r.status === 'cancel_waiting') {
      day.absentCount += 1
      continue
    }
    const absent = attMap.get(`${r.child_id}-${r.date}`)?.status === 'absent'
    if (absent) day.absentCount += 1
    else day.count += 1
    day.entries.push({
      id: r.id,
      childId: r.child_id,
      name: r.children?.name ?? '',
      absent,
    })
  }
  for (const day of dayMap.values()) {
    day.entries.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }

  // 月間サマリー
  const dayCounts = [...dayMap.values()].map((d) => d.count)
  const totalUsage = dayCounts.reduce((sum, c) => sum + c, 0)
  const activeDays = dayCounts.filter((c) => c > 0).length
  const averageUsage = activeDays > 0 ? totalUsage / activeDays : 0
  const maxUsage = dayCounts.length > 0 ? Math.max(...dayCounts) : 0
  const crowdedDays = dayCounts.filter((c) => c >= CROWDED_THRESHOLD).length

  // カレンダーのマス（月初の曜日ぶん先頭を空ける）
  const leadingBlanks = firstDay.getDay()
  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) =>
      toDateStr(new Date(firstDay.getFullYear(), firstDay.getMonth(), i + 1))
    ),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedUnit = units.find((u) => u.id === selectedUnitId)
  const isAfterSchool = selectedUnit?.service_type !== 'child_development'
  const serviceLabel = isAfterSchool ? '放' : '児'
  const serviceBadgeClass = isAfterSchool
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-teal-100 text-teal-700'

  return (
    <div className="space-y-3">
      {/* 月ナビゲーション */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium min-w-[120px] text-center">{monthLabel}</span>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 月間サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">{totalUsage}</div>
          <div className="text-xs text-gray-500 mt-1">月間延べ利用数</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{averageUsage.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">1日平均（{activeDays}日稼働）</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className={`text-2xl font-bold ${maxUsage >= CROWDED_THRESHOLD ? 'text-red-600' : 'text-gray-900'}`}>
            {maxUsage}
          </div>
          <div className="text-xs text-gray-500 mt-1">最大人数/日</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className={`text-2xl font-bold ${crowdedDays > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {crowdedDays}
          </div>
          <div className="text-xs text-gray-500 mt-1">{CROWDED_THRESHOLD}名以上の日</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[700px]">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`text-center text-xs font-medium py-1 rounded ${
                    i === 0
                      ? 'bg-red-50 text-red-600'
                      : i === 6
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 日付マス */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((dateStr, i) => {
                if (!dateStr) return <div key={`blank-${i}`} />

                const d = new Date(dateStr + 'T00:00:00')
                const dow = d.getDay()
                const isToday = dateStr === today
                const day = dayMap.get(dateStr)
                const count = day?.count ?? 0
                const absentCount = day?.absentCount ?? 0
                const isCrowded = count >= CROWDED_THRESHOLD

                return (
                  <div
                    key={dateStr}
                    className={`flex flex-col rounded-lg border ${
                      isCrowded ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    {/* 日付ヘッダー */}
                    <button
                      onClick={() => router.push(`/attendance?date=${dateStr}&unit=${selectedUnitId}`)}
                      className={`text-center py-1.5 px-1 rounded-t-lg font-medium transition-colors ${
                        isCrowded
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : isToday
                          ? 'bg-indigo-600 text-white'
                          : dow === 0
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : dow === 6
                          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <div className="text-base font-bold leading-none">{d.getDate()}</div>
                      <div className={`text-[10px] mt-0.5 ${isCrowded ? 'font-bold' : 'opacity-75'}`}>
                        {count}名
                        {absentCount > 0 && ` / ${absentCount}欠`}
                      </div>
                    </button>

                    {/* 児童リスト */}
                    <div
                      className={`border-t rounded-b-lg flex-1 min-h-[90px] max-h-[150px] overflow-y-auto p-1 ${
                        isCrowded ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'
                      }`}
                    >
                      {(day?.entries ?? []).map((entry) => (
                        <div
                          key={entry.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/attendance/child/${entry.childId}?date=${dateStr}`)
                          }}
                          className={`text-[10px] leading-relaxed mb-0.5 rounded px-0.5 cursor-pointer hover:bg-gray-100 transition-colors ${
                            entry.absent ? 'opacity-40' : ''
                          }`}
                        >
                          <span className={`inline-block px-0.5 rounded text-[9px] mr-0.5 font-medium ${serviceBadgeClass}`}>
                            {serviceLabel}
                          </span>
                          <span className={entry.absent ? 'text-gray-400 line-through' : 'text-gray-700'}>
                            {entry.name}
                          </span>
                        </div>
                      ))}

                      {count === 0 && absentCount === 0 && (
                        <div className="text-[11px] text-gray-300 text-center mt-6">-</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
