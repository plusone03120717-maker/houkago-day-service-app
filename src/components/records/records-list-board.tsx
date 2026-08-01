'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BookOpen, ChevronRight, CheckCircle, Flag,
  Car, ChevronDown, ChevronUp, Trash2, Check,
} from 'lucide-react'
import { DateNav } from '@/components/ui/date-nav'
import { formatDate } from '@/lib/utils'

type AttendedChild = {
  id: string
  child_id: string
  unit_id: string
  status: string
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

type DailyRecord = {
  id: string
  attendance_id: string
  has_notable_flag: boolean
}

type StaffMember = { id: string; name: string }
type Vehicle = { id: string; name: string }

type TransportFields = {
  basicService: boolean
  pickupDepartureTime: string
  pickupArrivalTime: string
  pickupDriverId: string
  pickupVehicleId: string
  dropoffDepartureTime: string
  dropoffArrivalTime: string
  dropoffDriverId: string
  dropoffVehicleId: string
  serviceStartTime: string
  serviceEndTime: string
  daytimePickupDepartureTime: string
  daytimePickupArrivalTime: string
  daytimePickupDriverId: string
  daytimePickupVehicleId: string
  daytimeDropoffDepartureTime: string
  daytimeDropoffArrivalTime: string
  daytimeDropoffDriverId: string
  daytimeDropoffVehicleId: string
}

interface Props {
  targetDate: string
  prevDate: string
  nextDate: string
  byUnit: Record<string, { unitName: string; items: AttendedChild[] }>
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  recordByAttendanceId: Record<string, DailyRecord>
  writtenCount: number
  totalCount: number
  defaultServiceEndTime: string
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const hhmm = t.slice(0, 5)
  return hhmm === '00:00' ? '' : hhmm
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const norm = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`
}

function initFields(a: AttendedChild, defaultEnd: string): TransportFields {
  return {
    basicService: a.basic_service ?? true,
    pickupDepartureTime: fmtTime(a.pickup_departure_time),
    pickupArrivalTime: fmtTime(a.pickup_arrival_time),
    pickupDriverId: a.pickup_driver_member_id ?? '',
    pickupVehicleId: a.pickup_vehicle_id ?? '',
    dropoffDepartureTime: fmtTime(a.dropoff_departure_time),
    dropoffArrivalTime: fmtTime(a.dropoff_arrival_time),
    dropoffDriverId: a.dropoff_driver_member_id ?? '',
    dropoffVehicleId: a.dropoff_vehicle_id ?? '',
    serviceStartTime: fmtTime(a.service_start_time),
    serviceEndTime: fmtTime(a.service_end_time) || defaultEnd,
    daytimePickupDepartureTime: fmtTime(a.daytime_pickup_departure_time),
    daytimePickupArrivalTime: fmtTime(a.daytime_pickup_arrival_time),
    daytimePickupDriverId: a.daytime_pickup_driver_member_id ?? '',
    daytimePickupVehicleId: a.daytime_pickup_vehicle_id ?? '',
    daytimeDropoffDepartureTime: fmtTime(a.daytime_dropoff_departure_time),
    daytimeDropoffArrivalTime: fmtTime(a.daytime_dropoff_arrival_time),
    daytimeDropoffDriverId: a.daytime_dropoff_driver_member_id ?? '',
    daytimeDropoffVehicleId: a.daytime_dropoff_vehicle_id ?? '',
  }
}

function hasTransportData(f: TransportFields): boolean {
  return !!(
    f.pickupArrivalTime || f.pickupDepartureTime || f.pickupDriverId ||
    f.dropoffArrivalTime || f.dropoffDepartureTime || f.dropoffDriverId
  )
}

export function RecordsListBoard({
  targetDate,
  prevDate,
  nextDate,
  byUnit,
  staffMembers,
  vehicles,
  recordByAttendanceId,
  writtenCount,
  totalCount,
  defaultServiceEndTime,
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fieldStates, setFieldStates] = useState<Record<string, TransportFields>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const allItems = Object.values(byUnit).flatMap((u) => u.items)

  const getFields = (a: AttendedChild): TransportFields =>
    fieldStates[a.id] ?? initFields(a, defaultServiceEndTime)

  const setField = (attendanceId: string, patch: Partial<TransportFields>, a: AttendedChild) => {
    setFieldStates((prev) => ({
      ...prev,
      [attendanceId]: { ...(prev[attendanceId] ?? initFields(a, defaultServiceEndTime)), ...patch },
    }))
  }

  const handlePickupDepartureChange = (val: string, a: AttendedChild) => {
    const f = getFields(a)
    const patch: Partial<TransportFields> = { pickupDepartureTime: val }
    if (val && !f.pickupArrivalTime) {
      const arrival = addMinutes(val, 10)
      patch.pickupArrivalTime = arrival
      patch.serviceStartTime = arrival
      if (!f.serviceEndTime) patch.serviceEndTime = defaultServiceEndTime
    }
    setField(a.id, patch, a)
  }

  const handlePickupArrivalChange = (val: string, a: AttendedChild) => {
    const f = getFields(a)
    const patch: Partial<TransportFields> = { pickupArrivalTime: val }
    if (val) {
      patch.serviceStartTime = val
      if (!f.serviceEndTime) patch.serviceEndTime = defaultServiceEndTime
    }
    setField(a.id, patch, a)
  }

  const handleDropoffArrivalBlur = (val: string, a: AttendedChild) => {
    if (val) setField(a.id, { dropoffDepartureTime: addMinutes(val, -10) }, a)
  }

  const handleSave = async (a: AttendedChild) => {
    setSaving(a.id)
    const f = getFields(a)
    const n = (v: string) => (v && v !== '00:00' ? v : null)

    await supabase.from('daily_attendance').update({
      basic_service: f.basicService,
      pickup_departure_time: n(f.pickupDepartureTime),
      pickup_arrival_time: n(f.pickupArrivalTime),
      pickup_driver_member_id: f.pickupDriverId || null,
      pickup_vehicle_id: f.pickupVehicleId || null,
      dropoff_departure_time: n(f.dropoffDepartureTime),
      dropoff_arrival_time: n(f.dropoffArrivalTime),
      dropoff_driver_member_id: f.dropoffDriverId || null,
      dropoff_vehicle_id: f.dropoffVehicleId || null,
      service_start_time: n(f.serviceStartTime),
      service_end_time: n(f.serviceEndTime),
      daytime_pickup_departure_time: a.daytime_support ? n(f.daytimePickupDepartureTime) : null,
      daytime_pickup_arrival_time: a.daytime_support ? n(f.daytimePickupArrivalTime) : null,
      daytime_pickup_driver_member_id: a.daytime_support ? (f.daytimePickupDriverId || null) : null,
      daytime_pickup_vehicle_id: a.daytime_support ? (f.daytimePickupVehicleId || null) : null,
      daytime_dropoff_departure_time: a.daytime_support ? n(f.daytimeDropoffDepartureTime) : null,
      daytime_dropoff_arrival_time: a.daytime_support ? n(f.daytimeDropoffArrivalTime) : null,
      daytime_dropoff_driver_member_id: a.daytime_support ? (f.daytimeDropoffDriverId || null) : null,
      daytime_dropoff_vehicle_id: a.daytime_support ? (f.daytimeDropoffVehicleId || null) : null,
    }).eq('id', a.id)

    setSaving(null)
    setSavedIds((prev) => new Set(prev).add(a.id))
    setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(a.id); return s }), 2000)
    startTransition(() => {})
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500'
  const selectCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-teal-500'

  const renderTransportDirection = (
    label: string,
    deptVal: string, onDept: (v: string) => void,
    arrivVal: string, onArriv: (v: string) => void,
    driverId: string, onDriver: (v: string) => void,
    vehicleId: string, onVehicle: (v: string) => void,
    onClear: () => void,
    onArrivBlur: ((v: string) => void) | undefined = undefined,
    accentColor = 'teal',
  ) => {
    const hasSomething = !!(deptVal || arrivVal || driverId || vehicleId)
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-xs font-semibold text-${accentColor}-700`}>{label}</p>
          {hasSomething && (
            <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <Trash2 className="h-3 w-3" />クリア
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">出発時間</label>
            <input type="time" value={deptVal}
              onChange={(e) => onDept(e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">到着時間</label>
            <input type="time" value={arrivVal}
              onChange={(e) => onArriv(e.target.value)}
              onBlur={onArrivBlur ? (e) => onArrivBlur(e.target.value) : undefined}
              className={inputCls} />
          </div>
          {staffMembers.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ドライバー</label>
              <select value={driverId} onChange={(e) => onDriver(e.target.value)} className={selectCls}>
                <option value="">未選択</option>
                {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {vehicles.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">車種</label>
              <select value={vehicleId} onChange={(e) => onVehicle(e.target.value)} className={selectCls}>
                <option value="">未選択</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">日々の記録</h1>
        <p className="text-sm text-gray-500 mt-0.5">児童ごとの日報・活動記録・連絡帳</p>
      </div>

      <div className="flex items-center gap-3">
        <DateNav
          targetDate={targetDate}
          prevDate={prevDate}
          nextDate={nextDate}
          basePath="/records"
        />
        <span className="text-sm text-gray-500">{formatDate(targetDate, 'yyyy年MM月dd日')}</span>
        <span className="ml-auto text-sm text-gray-500">
          記録済 {writtenCount} / {totalCount} 名
        </span>
      </div>

      {allItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          この日の出席記録がありません
        </div>
      ) : (
        Object.entries(byUnit).map(([unitId, { unitName, items }]) => (
          <div key={unitId}>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{unitName}</h2>
            <div className="space-y-3">
              {items.map((a) => {
                const record = recordByAttendanceId[a.id]
                const hasRecord = !!record
                const isAbsent = a.status === 'absent'
                const isExpanded = expanded === a.id
                const f = getFields(a)
                const isSaving = saving === a.id
                const isSaved = savedIds.has(a.id)

                return (
                  <div key={a.id}>
                    {/* カードの上部: 名前・ステータス → 詳細へのリンク */}
                    <Card className={`${isAbsent ? 'opacity-60' : ''} ${isExpanded ? 'rounded-b-none border-b-0' : ''} overflow-hidden`}>
                      <Link href={`/records/${a.child_id}?date=${targetDate}&unit=${unitId}`}>
                        <CardContent className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              hasRecord ? 'bg-green-100' : isAbsent ? 'bg-gray-100' : 'bg-orange-100'
                            }`}>
                              <BookOpen className={`h-4 w-4 ${
                                hasRecord ? 'text-green-600' : isAbsent ? 'text-gray-400' : 'text-orange-500'
                              }`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{a.children?.name ?? '—'}</p>
                              {a.children?.name_kana && (
                                <p className="text-xs text-gray-400">{a.children.name_kana}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isAbsent && <Badge variant="secondary" className="text-xs">欠席</Badge>}
                            {record?.has_notable_flag && <Flag className="h-4 w-4 text-yellow-500" />}
                            {hasRecord ? (
                              <Badge variant="success" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />記録済
                              </Badge>
                            ) : !isAbsent ? (
                              <Badge variant="warning" className="text-xs">未記録</Badge>
                            ) : null}
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </CardContent>
                      </Link>

                      {/* 送迎入力トグル */}
                      {!isAbsent && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : a.id)}
                          className="w-full border-t border-gray-100 px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <span className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Car className="h-3.5 w-3.5 text-teal-500" />
                            送迎入力
                            {hasTransportData(f) && (
                              <span className="text-teal-600 font-medium">・入力済</span>
                            )}
                          </span>
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-gray-400" />
                            : <ChevronDown className="h-4 w-4 text-gray-400" />}
                        </button>
                      )}
                    </Card>

                    {/* 展開された送迎入力エリア */}
                    {isExpanded && !isAbsent && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-4 space-y-4">

                          {/* 放課後等デイサービス チェック */}
                          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-teal-700">
                            <input
                              type="checkbox"
                              checked={f.basicService}
                              onChange={(e) => setField(a.id, { basicService: e.target.checked }, a)}
                              className="w-4 h-4 accent-teal-600"
                            />
                            放課後等デイサービス
                          </label>

                          {f.basicService && (
                            <div className="space-y-4 pl-1">
                              {/* お迎え */}
                              {renderTransportDirection(
                                'お迎え',
                                f.pickupDepartureTime, (v) => handlePickupDepartureChange(v, a),
                                f.pickupArrivalTime, (v) => handlePickupArrivalChange(v, a),
                                f.pickupDriverId, (v) => setField(a.id, { pickupDriverId: v }, a),
                                f.pickupVehicleId, (v) => setField(a.id, { pickupVehicleId: v }, a),
                                () => setField(a.id, { pickupDepartureTime: '', pickupArrivalTime: '', pickupDriverId: '', pickupVehicleId: '' }, a),
                              )}

                              {/* 送り */}
                              {renderTransportDirection(
                                '送り',
                                f.dropoffDepartureTime, (v) => setField(a.id, { dropoffDepartureTime: v }, a),
                                f.dropoffArrivalTime, (v) => setField(a.id, { dropoffArrivalTime: v }, a),
                                f.dropoffDriverId, (v) => setField(a.id, { dropoffDriverId: v }, a),
                                f.dropoffVehicleId, (v) => setField(a.id, { dropoffVehicleId: v }, a),
                                () => setField(a.id, { dropoffDepartureTime: '', dropoffArrivalTime: '', dropoffDriverId: '', dropoffVehicleId: '' }, a),
                                (v) => handleDropoffArrivalBlur(v, a),
                              )}

                              {/* 提供時間 */}
                              <div className="border-t border-gray-100 pt-3">
                                <p className="text-xs font-semibold text-teal-700 mb-2">提供時間</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-500 mb-1 block">開始</label>
                                    <input type="time" value={f.serviceStartTime}
                                      onChange={(e) => setField(a.id, { serviceStartTime: e.target.value }, a)}
                                      className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500 mb-1 block">終了</label>
                                    <input type="time" value={f.serviceEndTime}
                                      onChange={(e) => setField(a.id, { serviceEndTime: e.target.value }, a)}
                                      className={inputCls} />
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                  ※ お迎え到着時間を入力すると開始時間に自動反映
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 日中一時利用 送迎 */}
                          {a.daytime_support && (
                            <div className="border-t border-gray-100 pt-4 space-y-4">
                              <p className="text-xs font-semibold text-purple-700">日中一時利用 送迎</p>

                              {renderTransportDirection(
                                'お迎え（日中一時）',
                                f.daytimePickupDepartureTime, (v) => setField(a.id, { daytimePickupDepartureTime: v }, a),
                                f.daytimePickupArrivalTime, (v) => setField(a.id, { daytimePickupArrivalTime: v }, a),
                                f.daytimePickupDriverId, (v) => setField(a.id, { daytimePickupDriverId: v }, a),
                                f.daytimePickupVehicleId, (v) => setField(a.id, { daytimePickupVehicleId: v }, a),
                                () => setField(a.id, { daytimePickupDepartureTime: '', daytimePickupArrivalTime: '', daytimePickupDriverId: '', daytimePickupVehicleId: '' }, a),
                                undefined,
                                'purple',
                              )}

                              {renderTransportDirection(
                                '送り（日中一時）',
                                f.daytimeDropoffDepartureTime, (v) => setField(a.id, { daytimeDropoffDepartureTime: v }, a),
                                f.daytimeDropoffArrivalTime, (v) => setField(a.id, { daytimeDropoffArrivalTime: v }, a),
                                f.daytimeDropoffDriverId, (v) => setField(a.id, { daytimeDropoffDriverId: v }, a),
                                f.daytimeDropoffVehicleId, (v) => setField(a.id, { daytimeDropoffVehicleId: v }, a),
                                () => setField(a.id, { daytimeDropoffDepartureTime: '', daytimeDropoffArrivalTime: '', daytimeDropoffDriverId: '', daytimeDropoffVehicleId: '' }, a),
                                undefined,
                                'purple',
                              )}
                            </div>
                          )}

                          {/* 保存ボタン */}
                          <div className="flex justify-end pt-2">
                            <Button
                              size="sm"
                              onClick={() => handleSave(a)}
                              disabled={isSaving}
                              className="px-6"
                            >
                              {isSaved ? (
                                <><Check className="h-3.5 w-3.5" />保存しました</>
                              ) : isSaving ? '保存中...' : '送迎を保存'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
