'use client'

import { getTodayJST } from '@/lib/utils'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { Unit } from './attendance-board'

const DAY_LABELS = ['月', '火', '水', '木', '金', '土']

function getWeekMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type WeekReservation = {
  id: string
  child_id: string
  date: string
  status: string
  children: { id: string; name: string; name_kana: string | null } | null
}

type WeekAttendance = {
  child_id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
}

type PlanInfo = {
  child_id: string
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  day_of_week: number[]
  start_date: string
  end_date: string | null
}

export function WeeklyAttendanceView({
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

  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<WeekReservation[]>([])
  const [attendances, setAttendances] = useState<WeekAttendance[]>([])
  const [plans, setPlans] = useState<PlanInfo[]>([])

  const weekMonday = addDays(getWeekMonday(baseDate), weekOffset * 7)
  const weekDates = Array.from({ length: 6 }, (_, i) => toDateStr(addDays(weekMonday, i)))

  useEffect(() => {
    if (!selectedUnitId) return
    setLoading(true)

    Promise.all([
      supabase
        .from('usage_reservations')
        .select('id, child_id, date, status, children(id, name, name_kana)')
        .eq('unit_id', selectedUnitId)
        .in('date', weekDates)
        .in('status', ['confirmed', 'reserved', 'cancel_waiting']),
      supabase
        .from('daily_attendance')
        .select('child_id, date, status, check_in_time, check_out_time')
        .eq('unit_id', selectedUnitId)
        .in('date', weekDates),
    ]).then(async ([{ data: resData }, { data: attData }]) => {
      const res = (resData ?? []) as unknown as WeekReservation[]
      const att = (attData ?? []) as unknown as WeekAttendance[]
      setReservations(res)
      setAttendances(att)

      const childIds = [...new Set(res.map((r) => r.child_id))]
      if (childIds.length > 0) {
        const { data: planData } = await supabase
          .from('usage_plans')
          .select('child_id, pickup_time, dropoff_time, service_start_time, service_end_time, day_of_week, start_date, end_date')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
          .in('child_id', childIds)
          .lte('start_date', weekDates[5])
          .or(`end_date.is.null,end_date.gte.${weekDates[0]}`)
        setPlans((planData ?? []) as PlanInfo[])
      } else {
        setPlans([])
      }

      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId, weekOffset])

  const attMap = new Map(attendances.map((a) => [`${a.child_id}-${a.date}`, a]))

  const getPlannedTime = (childId: string, dateStr: string) => {
    const dow = new Date(dateStr + 'T00:00:00').getDay()
    const plan = plans.find(
      (p) =>
        p.child_id === childId &&
        (p.day_of_week ?? []).includes(dow) &&
        p.start_date <= dateStr &&
        (p.end_date === null || p.end_date >= dateStr)
    )
    if (!plan) return { start: null, end: null }
    return {
      start: (plan.service_start_time ?? plan.pickup_time)?.slice(0, 5) ?? null,
      end: (plan.service_end_time ?? plan.dropoff_time)?.slice(0, 5) ?? null,
    }
  }

  const selectedUnit = units.find((u) => u.id === selectedUnitId)
  const isAfterSchool = selectedUnit?.service_type !== 'child_development'
  const serviceLabel = isAfterSchool ? '放' : '児'
  const serviceBadgeClass = isAfterSchool
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-teal-100 text-teal-700'

  const weekLabel = (() => {
    const start = weekMonday
    const end = addDays(weekMonday, 5)
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日〜${end.getDate()}日`
    }
    return `${start.getMonth() + 1}月${start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`
  })()

  return (
    <div className="space-y-3">
      {/* 週ナビゲーション */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit">
        <button onClick={() => setWeekOffset((o) => o - 1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium min-w-[200px] text-center">{weekLabel}</span>
        <button onClick={() => setWeekOffset((o) => o + 1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-6 gap-1.5 min-w-[700px]">
            {weekDates.map((dateStr, i) => {
              const d = new Date(dateStr + 'T00:00:00')
              const isToday = dateStr === today
              const isSat = i === 5

              const dayReservations = reservations
                .filter((r) => r.date === dateStr && r.status !== 'cancel_waiting')
                .sort((a, b) => {
                  const attA = attMap.get(`${a.child_id}-${dateStr}`)
                  const attB = attMap.get(`${b.child_id}-${dateStr}`)
                  const timeA =
                    attA?.check_in_time ?? getPlannedTime(a.child_id, dateStr).start ?? '99:99'
                  const timeB =
                    attB?.check_in_time ?? getPlannedTime(b.child_id, dateStr).start ?? '99:99'
                  return timeA.localeCompare(timeB)
                })

              const cancelledCount = reservations.filter(
                (r) => r.date === dateStr && r.status === 'cancel_waiting'
              ).length

              return (
                <div key={dateStr} className="flex flex-col">
                  {/* 曜日ヘッダー */}
                  <button
                    onClick={() => router.push(`/attendance?date=${dateStr}&unit=${selectedUnitId}`)}
                    className={`text-center py-2 px-1 rounded-t-lg font-medium transition-colors ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : isSat
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="text-xs opacity-75">{DAY_LABELS[i]}</div>
                    <div className="text-base font-bold leading-none">{d.getDate()}</div>
                    <div className="text-[10px] mt-0.5 opacity-75">
                      {dayReservations.length}名
                      {cancelledCount > 0 && ` / ${cancelledCount}欠`}
                    </div>
                  </button>

                  {/* 児童リスト */}
                  <div className="border border-t-0 border-gray-200 rounded-b-lg bg-white flex-1 min-h-[180px] p-1">
                    {dayReservations.map((r) => {
                      const att = attMap.get(`${r.child_id}-${dateStr}`)
                      const isAttended = att?.status === 'attended'
                      const isAbsent = att?.status === 'absent'
                      const planned = getPlannedTime(r.child_id, dateStr)
                      const startTime = att?.check_in_time?.slice(0, 5) ?? planned.start
                      const endTime = att?.check_out_time?.slice(0, 5) ?? planned.end

                      return (
                        <div
                          key={r.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/attendance/child/${r.child_id}?date=${dateStr}`)
                          }}
                          className={`text-[10px] leading-relaxed mb-0.5 rounded px-0.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                            isAbsent ? 'opacity-40' : ''
                          }`}
                        >
                          <span className={`inline-block px-0.5 rounded text-[9px] mr-0.5 font-medium ${serviceBadgeClass}`}>
                            {serviceLabel}
                          </span>
                          {startTime && endTime && (
                            <span className="text-gray-500">{startTime}-{endTime} </span>
                          )}
                          <span
                            className={
                              isAttended
                                ? 'text-gray-900 font-medium'
                                : isAbsent
                                ? 'text-gray-400 line-through'
                                : 'text-gray-600'
                            }
                          >
                            {r.children?.name ?? ''}
                          </span>
                        </div>
                      )
                    })}

                    {dayReservations.length === 0 && (
                      <div className="text-[11px] text-gray-300 text-center mt-8">-</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
