'use client'

import { Button } from '@/components/ui/button'
import { Trash2, Check, Copy, CalendarClock, Car, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

/** daily_attendance のうち送迎・日中一時に関わるカラム */
export type TransportRow = {
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
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
}

/** 利用スケジュール（usage_plans）から解決した当日の初期値 */
export type ScheduleDefaults = {
  transportType: string
  pickupTime: string | null
  dropoffTime: string | null
  serviceStartTime: string | null
  serviceEndTime: string | null
  daytimeSupport: boolean
  daytimeSupportStartTime: string | null
  daytimeSupportEndTime: string | null
}

export type TransportFields = {
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
  daytimeSupport: boolean
  daytimeSupportStartTime: string
  daytimeSupportEndTime: string
  daytimePickupDepartureTime: string
  daytimePickupArrivalTime: string
  daytimePickupDriverId: string
  daytimePickupVehicleId: string
  daytimeDropoffDepartureTime: string
  daytimeDropoffArrivalTime: string
  daytimeDropoffDriverId: string
  daytimeDropoffVehicleId: string
}

export type StaffMember = { id: string; name: string }
export type Vehicle = { id: string; name: string }

/** "16:30:00" → "16:30"。未設定・00:00 は空文字として扱う */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const hhmm = t.slice(0, 5)
  return hhmm === '00:00' ? '' : hhmm
}

export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const norm = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`
}

export function initFields(a: TransportRow, defaultEnd: string): TransportFields {
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
    daytimeSupport: a.daytime_support ?? false,
    daytimeSupportStartTime: fmtTime(a.daytime_support_start_time),
    daytimeSupportEndTime: fmtTime(a.daytime_support_end_time),
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

export function hasTransportData(f: TransportFields): boolean {
  return !!(
    f.pickupArrivalTime || f.pickupDepartureTime || f.pickupDriverId ||
    f.dropoffArrivalTime || f.dropoffDepartureTime || f.dropoffDriverId
  )
}

/** DB上の入力が実質空か（serviceEndTimeはデフォルト補完されるため除外） */
export function isBlankFields(f: TransportFields): boolean {
  return !(
    f.pickupDepartureTime || f.pickupArrivalTime || f.pickupDriverId || f.pickupVehicleId ||
    f.dropoffDepartureTime || f.dropoffArrivalTime || f.dropoffDriverId || f.dropoffVehicleId ||
    f.serviceStartTime || f.daytimeSupport ||
    f.daytimeSupportStartTime || f.daytimeSupportEndTime
  )
}

/** 利用スケジュールの内容を初期値として反映 */
export function applyScheduleDefaults(f: TransportFields, s: ScheduleDefaults, defaultEnd: string): TransportFields {
  const showPickup = s.transportType === 'pickup_only' || s.transportType === 'both'
  const showDropoff = s.transportType === 'dropoff_only' || s.transportType === 'both'
  const pickupTime = fmtTime(s.pickupTime)
  return {
    ...f,
    pickupArrivalTime: showPickup ? pickupTime : '',
    dropoffDepartureTime: showDropoff ? fmtTime(s.dropoffTime) : '',
    serviceStartTime: fmtTime(s.serviceStartTime) || (showPickup ? pickupTime : ''),
    serviceEndTime: fmtTime(s.serviceEndTime) || defaultEnd,
    daytimeSupport: s.daytimeSupport,
    daytimeSupportStartTime: s.daytimeSupport ? fmtTime(s.daytimeSupportStartTime) : '',
    daytimeSupportEndTime: s.daytimeSupport ? fmtTime(s.daytimeSupportEndTime) : '',
  }
}

/** daily_attendance へ保存する形に変換 */
export function buildTransportUpdate(f: TransportFields) {
  const n = (v: string) => (v && v !== '00:00' ? v : null)
  return {
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
    daytime_support: f.daytimeSupport,
    daytime_support_start_time: f.daytimeSupport ? n(f.daytimeSupportStartTime) : null,
    daytime_support_end_time: f.daytimeSupport ? n(f.daytimeSupportEndTime) : null,
    daytime_pickup_departure_time: f.daytimeSupport ? n(f.daytimePickupDepartureTime) : null,
    daytime_pickup_arrival_time: f.daytimeSupport ? n(f.daytimePickupArrivalTime) : null,
    daytime_pickup_driver_member_id: f.daytimeSupport ? (f.daytimePickupDriverId || null) : null,
    daytime_pickup_vehicle_id: f.daytimeSupport ? (f.daytimePickupVehicleId || null) : null,
    daytime_dropoff_departure_time: f.daytimeSupport ? n(f.daytimeDropoffDepartureTime) : null,
    daytime_dropoff_arrival_time: f.daytimeSupport ? n(f.daytimeDropoffArrivalTime) : null,
    daytime_dropoff_driver_member_id: f.daytimeSupport ? (f.daytimeDropoffDriverId || null) : null,
    daytime_dropoff_vehicle_id: f.daytimeSupport ? (f.daytimeDropoffVehicleId || null) : null,
  }
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500'
const inputClsPurple = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500'
const selectCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-teal-500'
const selectClsPurple = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-500'

/** 「送迎・日中一時入力」の開閉トグル行 */
export function TransportDaytimeToggle({
  expanded,
  onToggle,
  fields,
  isSchedulePreset = false,
  className = '',
}: {
  expanded: boolean
  onToggle: () => void
  fields: TransportFields
  isSchedulePreset?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full border-t border-gray-100 px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs text-gray-600">
        <Car className="h-3.5 w-3.5 text-teal-500" />
        送迎・日中一時入力
        {(hasTransportData(fields) || fields.daytimeSupport) && (
          isSchedulePreset ? (
            <span className="text-indigo-600 font-medium">・予定から自動入力（未保存）</span>
          ) : (
            <span className="text-teal-600 font-medium">・入力済</span>
          )
        )}
      </span>
      {expanded
        ? <ChevronUp className="h-4 w-4 text-gray-400" />
        : <ChevronDown className="h-4 w-4 text-gray-400" />}
    </button>
  )
}

interface PanelProps {
  fields: TransportFields
  onChange: (patch: Partial<TransportFields>) => void
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  defaultServiceEndTime: string
  /** 利用スケジュールから初期値を自動入力した状態か */
  isSchedulePreset?: boolean
  /** 前回コピー元の日付（yyyy-MM-dd）。null なら前回コピーを出さない */
  previousDate?: string | null
  onCopyPrevious?: () => void
  onSave: () => void
  saving: boolean
  saved: boolean
}

/** 送迎・日中一時の入力フォーム本体（出席管理・日々の記録で共通） */
export function TransportDaytimePanel({
  fields: f,
  onChange,
  staffMembers,
  vehicles,
  defaultServiceEndTime,
  isSchedulePreset = false,
  previousDate = null,
  onCopyPrevious,
  onSave,
  saving,
  saved,
}: PanelProps) {
  const handlePickupDepartureChange = (val: string) => {
    const patch: Partial<TransportFields> = { pickupDepartureTime: val }
    if (val && !f.pickupArrivalTime) {
      const arrival = addMinutes(val, 10)
      patch.pickupArrivalTime = arrival
      patch.serviceStartTime = arrival
      if (!f.serviceEndTime) patch.serviceEndTime = defaultServiceEndTime
    }
    onChange(patch)
  }

  const handlePickupArrivalChange = (val: string) => {
    const patch: Partial<TransportFields> = { pickupArrivalTime: val }
    if (val) {
      patch.serviceStartTime = val
      if (!f.serviceEndTime) patch.serviceEndTime = defaultServiceEndTime
    }
    onChange(patch)
  }

  const renderTransportDirection = (
    label: string,
    deptVal: string, onDept: (v: string) => void,
    arrivVal: string, onArriv: (v: string) => void,
    driverId: string, onDriver: (v: string) => void,
    vehicleId: string, onVehicle: (v: string) => void,
    onClear: () => void,
    onArrivBlur: ((v: string) => void) | undefined = undefined,
    purple = false,
  ) => {
    const hasSomething = !!(deptVal || arrivVal || driverId || vehicleId)
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={`text-xs font-semibold ${purple ? 'text-purple-700' : 'text-teal-700'}`}>{label}</p>
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
              className={purple ? inputClsPurple : inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">到着時間</label>
            <input type="time" value={arrivVal}
              onChange={(e) => onArriv(e.target.value)}
              onBlur={onArrivBlur ? (e) => onArrivBlur(e.target.value) : undefined}
              className={purple ? inputClsPurple : inputCls} />
          </div>
          {staffMembers.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ドライバー</label>
              <select value={driverId} onChange={(e) => onDriver(e.target.value)} className={purple ? selectClsPurple : selectCls}>
                <option value="">未選択</option>
                {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {vehicles.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">車種</label>
              <select value={vehicleId} onChange={(e) => onVehicle(e.target.value)} className={purple ? selectClsPurple : selectCls}>
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
      {/* ── スケジュール自動入力の表示・前回コピー ── */}
      {(isSchedulePreset || previousDate) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isSchedulePreset ? (
            <p className="flex items-center gap-1 text-xs text-indigo-600">
              <CalendarClock className="h-3.5 w-3.5" />
              利用スケジュールから初期値を自動入力
            </p>
          ) : (
            <span />
          )}
          {previousDate && onCopyPrevious && (
            <button
              type="button"
              onClick={onCopyPrevious}
              className="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-300 rounded-full px-3 py-1.5 hover:bg-teal-50 transition-colors ml-auto"
            >
              <Copy className="h-3.5 w-3.5" />
              前回（{formatDate(previousDate, 'MM月dd日')}）の内容をコピー
            </button>
          )}
        </div>
      )}

      {/* ── 放課後等デイサービス ── */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-teal-700">
          <input
            type="checkbox"
            checked={f.basicService}
            onChange={(e) => onChange({ basicService: e.target.checked })}
            className="w-4 h-4 accent-teal-600"
          />
          放課後等デイサービス
        </label>

        {f.basicService && (
          <div className="space-y-4 pl-1">
            {renderTransportDirection(
              'お迎え',
              f.pickupDepartureTime, handlePickupDepartureChange,
              f.pickupArrivalTime, handlePickupArrivalChange,
              f.pickupDriverId, (v) => onChange({ pickupDriverId: v }),
              f.pickupVehicleId, (v) => onChange({ pickupVehicleId: v }),
              () => onChange({ pickupDepartureTime: '', pickupArrivalTime: '', pickupDriverId: '', pickupVehicleId: '' }),
            )}

            {renderTransportDirection(
              '送り',
              f.dropoffDepartureTime, (v) => onChange({ dropoffDepartureTime: v }),
              f.dropoffArrivalTime, (v) => onChange({ dropoffArrivalTime: v }),
              f.dropoffDriverId, (v) => onChange({ dropoffDriverId: v }),
              f.dropoffVehicleId, (v) => onChange({ dropoffVehicleId: v }),
              () => onChange({ dropoffDepartureTime: '', dropoffArrivalTime: '', dropoffDriverId: '', dropoffVehicleId: '' }),
              (v) => { if (v) onChange({ dropoffDepartureTime: addMinutes(v, -10) }) },
            )}

            {/* 提供時間 */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-teal-700 mb-2">提供時間</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">開始</label>
                  <input type="time" value={f.serviceStartTime}
                    onChange={(e) => onChange({ serviceStartTime: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">終了</label>
                  <input type="time" value={f.serviceEndTime}
                    onChange={(e) => onChange({ serviceEndTime: e.target.value })}
                    className={inputCls} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                ※ お迎え到着時間を入力すると開始時間に自動反映
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 日中一時利用 ── */}
      <div className="border-t border-gray-100 pt-4 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-purple-700">
          <input
            type="checkbox"
            checked={f.daytimeSupport}
            onChange={(e) => onChange({ daytimeSupport: e.target.checked })}
            className="w-4 h-4 accent-purple-600"
          />
          日中一時利用
        </label>

        {f.daytimeSupport && (
          <div className="space-y-4 pl-1">
            {/* 利用時間 */}
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-2">利用時間</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">開始</label>
                  <input type="time" value={f.daytimeSupportStartTime}
                    onChange={(e) => onChange({ daytimeSupportStartTime: e.target.value })}
                    className={inputClsPurple} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">終了</label>
                  <input type="time" value={f.daytimeSupportEndTime}
                    onChange={(e) => onChange({ daytimeSupportEndTime: e.target.value })}
                    className={inputClsPurple} />
                </div>
              </div>
            </div>

            {/* 日中一時 お迎え */}
            {renderTransportDirection(
              'お迎え（日中一時）',
              f.daytimePickupDepartureTime, (v) => onChange({ daytimePickupDepartureTime: v }),
              f.daytimePickupArrivalTime, (v) => onChange({ daytimePickupArrivalTime: v }),
              f.daytimePickupDriverId, (v) => onChange({ daytimePickupDriverId: v }),
              f.daytimePickupVehicleId, (v) => onChange({ daytimePickupVehicleId: v }),
              () => onChange({ daytimePickupDepartureTime: '', daytimePickupArrivalTime: '', daytimePickupDriverId: '', daytimePickupVehicleId: '' }),
              undefined,
              true,
            )}

            {/* 日中一時 送り */}
            {renderTransportDirection(
              '送り（日中一時）',
              f.daytimeDropoffDepartureTime, (v) => onChange({ daytimeDropoffDepartureTime: v }),
              f.daytimeDropoffArrivalTime, (v) => onChange({ daytimeDropoffArrivalTime: v }),
              f.daytimeDropoffDriverId, (v) => onChange({ daytimeDropoffDriverId: v }),
              f.daytimeDropoffVehicleId, (v) => onChange({ daytimeDropoffVehicleId: v }),
              () => onChange({ daytimeDropoffDepartureTime: '', daytimeDropoffArrivalTime: '', daytimeDropoffDriverId: '', daytimeDropoffVehicleId: '' }),
              undefined,
              true,
            )}
          </div>
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={onSave} disabled={saving} className="px-6">
          {saved ? (
            <><Check className="h-3.5 w-3.5" />保存しました</>
          ) : saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  )
}
