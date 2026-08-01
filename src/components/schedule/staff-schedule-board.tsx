'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DateNav } from '@/components/ui/date-nav'
import { formatDate, getTodayJST } from '@/lib/utils'
import { ChevronDown, ChevronUp, User, Car, Clock, ArrowRight } from 'lucide-react'
import type { StaffMember, StaffShift, TransportAttendance } from '@/app/(dashboard)/schedule/page'

const SHIFT_LABELS: Record<string, { label: string; color: string }> = {
  full:      { label: '全日', color: 'bg-indigo-100 text-indigo-700' },
  morning:   { label: '午前', color: 'bg-blue-100 text-blue-700' },
  afternoon: { label: '午後', color: 'bg-teal-100 text-teal-700' },
  off:       { label: '休み', color: 'bg-gray-100 text-gray-500' },
  holiday:   { label: '有休', color: 'bg-orange-100 text-orange-700' },
}

interface Props {
  date: string
  staffMembers: StaffMember[]
  shifts: StaffShift[]
  attendance: TransportAttendance[]
  vehicles: { id: string; name: string }[]
}

type TransportItem = {
  direction: 'pickup' | 'dropoff' | 'daytime_pickup' | 'daytime_dropoff'
  childName: string
  vehicleId: string | null
  departureTime: string | null
  arrivalTime: string | null
}

function buildStaffTransport(
  staffMemberId: string,
  attendance: TransportAttendance[],
): TransportItem[] {
  const items: TransportItem[] = []

  for (const a of attendance) {
    const childName = a.children?.name ?? '—'
    if (a.pickup_driver_member_id === staffMemberId) {
      items.push({
        direction: 'pickup',
        childName,
        vehicleId: a.pickup_vehicle_id,
        departureTime: a.pickup_departure_time,
        arrivalTime: a.pickup_arrival_time,
      })
    }
    if (a.dropoff_driver_member_id === staffMemberId) {
      items.push({
        direction: 'dropoff',
        childName,
        vehicleId: a.dropoff_vehicle_id,
        departureTime: a.dropoff_departure_time,
        arrivalTime: a.dropoff_arrival_time,
      })
    }
    if (a.daytime_support) {
      if (a.daytime_pickup_driver_member_id === staffMemberId) {
        items.push({
          direction: 'daytime_pickup',
          childName,
          vehicleId: a.daytime_pickup_vehicle_id,
          departureTime: a.daytime_pickup_departure_time,
          arrivalTime: a.daytime_pickup_arrival_time,
        })
      }
      if (a.daytime_dropoff_driver_member_id === staffMemberId) {
        items.push({
          direction: 'daytime_dropoff',
          childName,
          vehicleId: a.daytime_dropoff_vehicle_id,
          departureTime: a.daytime_dropoff_departure_time,
          arrivalTime: a.daytime_dropoff_arrival_time,
        })
      }
    }
  }

  return items.sort((a, b) => {
    const ta = a.departureTime ?? '99:99'
    const tb = b.departureTime ?? '99:99'
    return ta.localeCompare(tb)
  })
}

const DIRECTION_LABELS: Record<string, { label: string; color: string }> = {
  pickup:          { label: 'お迎え',         color: 'text-blue-600' },
  dropoff:         { label: '送り',           color: 'text-orange-600' },
  daytime_pickup:  { label: 'お迎え（日中）', color: 'text-purple-600' },
  daytime_dropoff: { label: '送り（日中）',   color: 'text-purple-600' },
}

function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

export function StaffScheduleBoard({ date, staffMembers, shifts, attendance, vehicles }: Props) {
  const router = useRouter()
  const today = getTodayJST()
  const [expanded, setExpanded] = useState<string | null>(null)

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v.name]))
  const shiftByUserId = new Map(shifts.map((s) => [s.staff_id, s]))

  const [y, m, d2] = date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d2)
  const prevObj = new Date(y, m - 1, d2 - 1)
  const nextObj = new Date(y, m - 1, d2 + 1)
  const fmt10 = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">スタッフスケジュール</h1>
        <p className="text-sm text-gray-500 mt-0.5">スタッフごとのシフトと送迎担当を確認</p>
      </div>

      <div className="flex items-center gap-3">
        <DateNav
          targetDate={date}
          prevDate={fmt10(prevObj)}
          nextDate={fmt10(nextObj)}
          basePath="/schedule"
        />
        <span className="text-sm text-gray-500">{formatDate(date, 'yyyy年MM月dd日')}</span>
      </div>

      {staffMembers.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">スタッフが登録されていません</div>
      ) : (
        <div className="space-y-3">
          {staffMembers.map((staff) => {
            const shift = staff.user_id ? shiftByUserId.get(staff.user_id) : undefined
            const transportItems = buildStaffTransport(staff.id, attendance)
            const isExpanded = expanded === staff.id
            const shiftInfo = shift ? SHIFT_LABELS[shift.shift_type] : null
            const isOff = shift?.shift_type === 'off' || shift?.shift_type === 'holiday'

            return (
              <div key={staff.id}>
                <Card className={`overflow-hidden ${isExpanded ? 'rounded-b-none border-b-0' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : staff.id)}
                    className="w-full text-left"
                  >
                    <CardContent className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isOff ? 'bg-gray-100' : 'bg-indigo-100'
                        }`}>
                          <User className={`h-4 w-4 ${isOff ? 'text-gray-400' : 'text-indigo-600'}`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{staff.name}</p>
                          {shift ? (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${shiftInfo?.color ?? 'bg-gray-100 text-gray-500'}`}>
                                {shiftInfo?.label ?? shift.shift_type}
                              </span>
                              {shift.start_time && shift.end_time && !isOff && (
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {shift.start_time.slice(0, 5)}〜{shift.end_time.slice(0, 5)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">シフト未登録</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {transportItems.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                            <Car className="h-3.5 w-3.5" />
                            {transportItems.length}件の送迎
                          </span>
                        )}
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </CardContent>
                  </button>
                </Card>

                {/* 展開: 個別スケジュール詳細 */}
                {isExpanded && (
                  <Card className="rounded-t-none border-t-0 bg-gray-50">
                    <CardContent className="p-4 space-y-4">

                      {/* シフト詳細 */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">シフト</p>
                        {shift ? (
                          <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-200">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${shiftInfo?.color ?? 'bg-gray-100 text-gray-500'}`}>
                              {shiftInfo?.label ?? shift.shift_type}
                            </span>
                            {!isOff && shift.start_time && (
                              <span className="text-sm text-gray-700 flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                {shift.start_time.slice(0, 5)} 〜 {shift.end_time?.slice(0, 5) ?? '—'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 pl-1">シフトが登録されていません</p>
                        )}
                      </div>

                      {/* 送迎担当 */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2">送迎担当（日々の記録より）</p>
                        {transportItems.length === 0 ? (
                          <p className="text-sm text-gray-400 pl-1">この日の送迎担当はありません</p>
                        ) : (
                          <div className="space-y-2">
                            {transportItems.map((item, idx) => {
                              const dir = DIRECTION_LABELS[item.direction]
                              const vehicleName = item.vehicleId ? (vehicleMap.get(item.vehicleId) ?? '—') : '—'
                              return (
                                <div key={idx} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-semibold ${dir.color}`}>{dir.label}</span>
                                      <span className="text-sm font-medium text-gray-900">{item.childName}</span>
                                    </div>
                                    {(item.departureTime || item.arrivalTime) && (
                                      <span className="text-xs text-gray-500 flex items-center gap-1">
                                        {fmtTime(item.departureTime)}
                                        <ArrowRight className="h-3 w-3" />
                                        {fmtTime(item.arrivalTime)}
                                      </span>
                                    )}
                                  </div>
                                  {item.vehicleId && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Car className="h-3 w-3 text-gray-400" />
                                      <span className="text-xs text-gray-500">{vehicleName}</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
