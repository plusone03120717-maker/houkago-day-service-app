'use client'

import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Home, School } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addMinutes, TRANSPORT_TRAVEL_MINUTES } from '@/lib/transport-timing'
import {
  fmtTime,
  type ScheduleDefaults,
  type StaffMember,
  type TransportFields,
  type Vehicle,
} from '@/components/transport/transport-daytime-panel'

/**
 * 出席管理の「かんたん入力」（試作・2026-11-16 依頼主の検討用。本番にはまだ入れない）。
 *
 * 入れるのは「区分（放デイ／日中一時／両方）」「お迎えの時刻・ドライバー・車種」
 * 「帰りの時刻・ドライバー・車種」だけ。残りの欄（到着の時刻・利用時間・
 * 送迎を放デイと日中一時のどちらの欄に書くか）は、ここで決めて今と同じ20欄に書く。
 * 細かく直したいときは「くわしく直す」で今の入力画面を開く。
 *
 * 決め方（今の画面・承認・送迎管理と同じ考え方）:
 *  - 到着＝出発の10分後（TRANSPORT_TRAVEL_MINUTES）
 *  - 利用開始＝お迎えの到着（お迎えがない日は今の開始のまま）、利用終了＝帰りの出発
 *  - 両方の日は「放デイ 開始〜切りかえ」「日中一時 切りかえ〜終了」。お迎えは放デイの欄、帰りは日中一時の欄
 *  - 日中一時だけの日は放デイの時刻と送迎を消す（使わない側の時刻が残ると、放デイの基本報酬が立つため）
 */

export type DayKind = 'hd' | 'ni' | 'both'

export type EasyState = {
  kind: DayKind
  /** 両方の日の切りかえ時刻（放デイの終わり＝日中一時の始まり） */
  switchTime: string
  noPickup: boolean
  pickupTime: string
  pickupDriverId: string
  pickupVehicleId: string
  noDropoff: boolean
  dropoffTime: string
  dropoffDriverId: string
  dropoffVehicleId: string
}

/** 両方の日の切りかえ。9〜11月の記録の92%が16:30（2026-11-16 調べ） */
export const DEFAULT_SWITCH_TIME = '16:30'

export const KIND_LABEL: Record<DayKind, string> = {
  hd: '放課後デイ',
  ni: '日中一時',
  both: '両方',
}

export function kindOf(f: Pick<TransportFields, 'basicService' | 'daytimeSupport'>): DayKind {
  if (f.daytimeSupport && f.basicService) return 'both'
  if (f.daytimeSupport) return 'ni'
  return 'hd'
}

/** 予定（いつもの予定・特定日・保護者の連絡）での区分 */
export function scheduleKindOf(s: ScheduleDefaults | undefined): DayKind | null {
  if (!s) return null
  return s.daytimeSupport ? 'both' : 'hd'
}

/** 今の20欄から、かんたん入力の状態を読み取る */
export function easyFromFields(f: TransportFields): EasyState {
  const kind = kindOf(f)
  // お迎えは日中一時だけの日は日中一時の欄、それ以外は放デイの欄。帰りは放デイだけの日だけ放デイの欄
  const pDep = kind === 'ni' ? f.daytimePickupDepartureTime : f.pickupDepartureTime
  const pDrv = kind === 'ni' ? f.daytimePickupDriverId : f.pickupDriverId
  const pVeh = kind === 'ni' ? f.daytimePickupVehicleId : f.pickupVehicleId
  const dDep = kind === 'hd' ? f.dropoffDepartureTime : f.daytimeDropoffDepartureTime
  const dDrv = kind === 'hd' ? f.dropoffDriverId : f.daytimeDropoffDriverId
  const dVeh = kind === 'hd' ? f.dropoffVehicleId : f.daytimeDropoffVehicleId
  return {
    kind,
    switchTime: (kind === 'both' && (f.serviceEndTime || f.daytimeSupportStartTime)) || DEFAULT_SWITCH_TIME,
    noPickup: !pDep && !pDrv && !pVeh,
    pickupTime: pDep,
    pickupDriverId: pDrv,
    pickupVehicleId: pVeh,
    noDropoff: !dDep && !dDrv && !dVeh,
    dropoffTime: dDep,
    dropoffDriverId: dDrv,
    dropoffVehicleId: dVeh,
  }
}

/** その日の利用時間（開始・終了）。お迎え・帰りがない日は今の値・予定の値を使う */
function rangeOf(s: EasyState, base: TransportFields, fallbackEnd: string): { start: string; end: string } {
  const currentStart =
    base.basicService ? base.serviceStartTime : base.daytimeSupportStartTime || base.serviceStartTime
  const currentEnd = base.daytimeSupport ? base.daytimeSupportEndTime || base.serviceEndTime : base.serviceEndTime
  const start = !s.noPickup && s.pickupTime ? addMinutes(s.pickupTime, TRANSPORT_TRAVEL_MINUTES) : currentStart
  const end = !s.noDropoff && s.dropoffTime ? s.dropoffTime : currentEnd || fallbackEnd
  return { start, end }
}

/** かんたん入力の状態を、今と同じ20欄に組み立てる */
export function fieldsFromEasy(s: EasyState, base: TransportFields, fallbackEnd: string): TransportFields {
  const { start, end } = rangeOf(s, base, fallbackEnd)
  const pickup = s.noPickup || !s.pickupTime
    ? { dep: '', arr: '', drv: '', veh: '' }
    : { dep: s.pickupTime, arr: addMinutes(s.pickupTime, TRANSPORT_TRAVEL_MINUTES), drv: s.pickupDriverId, veh: s.pickupVehicleId }
  const dropoff = s.noDropoff || !s.dropoffTime
    ? { dep: '', arr: '', drv: '', veh: '' }
    : { dep: s.dropoffTime, arr: addMinutes(s.dropoffTime, TRANSPORT_TRAVEL_MINUTES), drv: s.dropoffDriverId, veh: s.dropoffVehicleId }
  const none = { dep: '', arr: '', drv: '', veh: '' }

  const basicPickup = s.kind === 'ni' ? none : pickup
  const basicDropoff = s.kind === 'hd' ? dropoff : none
  const dayPickup = s.kind === 'ni' ? pickup : none
  const dayDropoff = s.kind === 'hd' ? none : dropoff

  return {
    ...base,
    basicService: s.kind !== 'ni',
    daytimeSupport: s.kind !== 'hd',
    serviceStartTime: s.kind === 'ni' ? '' : start,
    serviceEndTime: s.kind === 'ni' ? '' : s.kind === 'both' ? s.switchTime : end,
    daytimeSupportStartTime: s.kind === 'hd' ? '' : s.kind === 'both' ? s.switchTime : start,
    daytimeSupportEndTime: s.kind === 'hd' ? '' : end,
    pickupDepartureTime: basicPickup.dep,
    pickupArrivalTime: basicPickup.arr,
    pickupDriverId: basicPickup.drv,
    pickupVehicleId: basicPickup.veh,
    dropoffDepartureTime: basicDropoff.dep,
    dropoffArrivalTime: basicDropoff.arr,
    dropoffDriverId: basicDropoff.drv,
    dropoffVehicleId: basicDropoff.veh,
    daytimePickupDepartureTime: dayPickup.dep,
    daytimePickupArrivalTime: dayPickup.arr,
    daytimePickupDriverId: dayPickup.drv,
    daytimePickupVehicleId: dayPickup.veh,
    daytimeDropoffDepartureTime: dayDropoff.dep,
    daytimeDropoffArrivalTime: dayDropoff.arr,
    daytimeDropoffDriverId: dayDropoff.drv,
    daytimeDropoffVehicleId: dayDropoff.veh,
  }
}

function minutesBetween(a: string, b: string): number | null {
  if (!a || !b) return null
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return m(b) - m(a)
}

function durationText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ''}` : `${m}分`
}

/** 保存させない間違い（安全策）。なければ null */
export function easyError(s: EasyState, f: TransportFields): string | null {
  const ranges: Array<[string, string, string]> = []
  if (s.kind !== 'ni') ranges.push(['放課後デイ', f.serviceStartTime, f.serviceEndTime])
  if (s.kind !== 'hd') ranges.push(['日中一時', f.daytimeSupportStartTime, f.daytimeSupportEndTime])
  for (const [label, a, b] of ranges) {
    if (!a || !b) return `${label}の利用時間が決まりません。お迎えか帰りの時刻を入れてください`
    const d = minutesBetween(a, b)
    if (d === null || d <= 0) {
      return s.kind === 'both'
        ? '切りかえの時刻が、お迎えと帰りの間に入っていません'
        : '帰りの時刻が、利用の開始より前になっています'
    }
    if (d < 30) return `${label}の利用時間が30分未満です。時刻を確かめてください`
  }
  return null
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400'

interface Props {
  fields: TransportFields
  onChange: (next: TransportFields) => void
  schedule?: ScheduleDefaults
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  defaultServiceEndTime: string
  onSave: () => void
  saving: boolean
  saved: boolean
  /** 「くわしく直す」で今の入力画面を開く */
  onOpenDetail: () => void
  detailOpen: boolean
}

export function EasyAttendancePanel({
  fields,
  onChange,
  schedule,
  staffMembers,
  vehicles,
  defaultServiceEndTime,
  onSave,
  saving,
  saved,
  onOpenDetail,
  detailOpen,
}: Props) {
  const [s, setS] = useState<EasyState>(() => easyFromFields(fields))
  const plannedKind = scheduleKindOf(schedule)

  const update = (patch: Partial<EasyState>) => {
    const next = { ...s, ...patch }
    if (patch.kind === 'both' && s.kind !== 'both') {
      next.switchTime = fmtTime(schedule?.daytimeSupportStartTime) || DEFAULT_SWITCH_TIME
    }
    setS(next)
    onChange(fieldsFromEasy(next, fields, defaultServiceEndTime))
  }

  const f = fieldsFromEasy(s, fields, defaultServiceEndTime)
  const error = easyError(s, f)
  const kindDiffers = plannedKind !== null && plannedKind !== s.kind
  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? ''

  const handleSave = () => {
    if (error) return
    if (kindDiffers) {
      const ok = window.confirm(
        `予定は「${KIND_LABEL[plannedKind!]}」です。「${KIND_LABEL[s.kind]}」で記録すると、請求先が変わります。この内容で保存しますか？`
      )
      if (!ok) return
    }
    onSave()
  }

  const direction = (
    kind: 'pickup' | 'dropoff',
  ) => {
    const isPickup = kind === 'pickup'
    const off = isPickup ? s.noPickup : s.noDropoff
    const time = isPickup ? s.pickupTime : s.dropoffTime
    const drv = isPickup ? s.pickupDriverId : s.dropoffDriverId
    const veh = isPickup ? s.pickupVehicleId : s.dropoffVehicleId
    const Icon = isPickup ? School : Home
    return (
      <div className="grid grid-cols-[5.5rem_1fr_1.2fr_1fr] gap-2 items-end">
        <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 pb-2">
          <Icon className="h-4 w-4 text-indigo-500" />
          {isPickup ? 'お迎え' : '帰り'}
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{isPickup ? '学校などに着く' : '事業所を出る'}</label>
          <input
            type="time"
            aria-label={isPickup ? 'お迎えの時刻' : '帰りの時刻'}
            value={off ? '' : time}
            disabled={off}
            onChange={(e) => update(isPickup ? { pickupTime: e.target.value } : { dropoffTime: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">ドライバー</label>
          <select
            aria-label={isPickup ? 'お迎えのドライバー' : '帰りのドライバー'}
            value={off ? '' : drv}
            disabled={off}
            onChange={(e) => update(isPickup ? { pickupDriverId: e.target.value } : { dropoffDriverId: e.target.value })}
            className={`${inputCls} bg-white`}
          >
            <option value="">未選択</option>
            {staffMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">車種</label>
          <select
            aria-label={isPickup ? 'お迎えの車種' : '帰りの車種'}
            value={off ? '' : veh}
            disabled={off}
            onChange={(e) => update(isPickup ? { pickupVehicleId: e.target.value } : { dropoffVehicleId: e.target.value })}
            className={`${inputCls} bg-white`}
          >
            <option value="">未選択</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>
    )
  }

  // 記録される中身の要約
  const lines: string[] = []
  if (s.kind !== 'ni') {
    const d = minutesBetween(f.serviceStartTime, f.serviceEndTime)
    lines.push(`放課後デイ ${f.serviceStartTime || '—'}〜${f.serviceEndTime || '—'}${d && d > 0 ? `（${durationText(d)}）` : ''}`)
  }
  if (s.kind !== 'hd') {
    const d = minutesBetween(f.daytimeSupportStartTime, f.daytimeSupportEndTime)
    lines.push(`日中一時 ${f.daytimeSupportStartTime || '—'}〜${f.daytimeSupportEndTime || '—'}${d && d > 0 ? `（${durationText(d)}）` : ''}`)
  }
  const pickupText = s.noPickup || !s.pickupTime
    ? 'お迎え：送迎なし'
    : `お迎え：${nameOf(staffMembers, s.pickupDriverId) || 'ドライバー未選択'}・${nameOf(vehicles, s.pickupVehicleId) || '車種未選択'}（事業所着 ${addMinutes(s.pickupTime, TRANSPORT_TRAVEL_MINUTES)}）`
  const dropoffText = s.noDropoff || !s.dropoffTime
    ? '帰り：送迎なし'
    : `帰り：${nameOf(staffMembers, s.dropoffDriverId) || 'ドライバー未選択'}・${nameOf(vehicles, s.dropoffVehicleId) || '車種未選択'}（自宅など着 ${addMinutes(s.dropoffTime, TRANSPORT_TRAVEL_MINUTES)}）`
  const transportCount = (s.noPickup || !s.pickupTime ? 0 : 1) + (s.noDropoff || !s.dropoffTime ? 0 : 1)

  return (
    <div className="space-y-4" data-testid="easy-attendance-panel">
      {/* 区分 */}
      <div>
        <div className="text-xs text-gray-500 mb-1.5">きょうの利用</div>
        <div className="grid grid-cols-3 rounded-lg border border-gray-200 overflow-hidden">
          {(['hd', 'ni', 'both'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ kind: k })}
              className={`py-2 text-sm font-medium transition-colors ${
                s.kind === k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {s.kind === 'both' && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-gray-600">放課後デイ → 日中一時に切りかえる時刻</span>
            <input
              type="time"
              aria-label="切りかえの時刻"
              value={s.switchTime}
              onChange={(e) => update({ switchTime: e.target.value })}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
            />
          </div>
        )}
        {kindDiffers && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            予定は「{KIND_LABEL[plannedKind!]}」です。変えて保存するときは、もう一度確かめます（請求先が変わるため）。
          </p>
        )}
      </div>

      {/* お迎え・帰り */}
      <div className="space-y-3">
        {direction('pickup')}
        {direction('dropoff')}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update({ noPickup: !s.noPickup })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              s.noPickup ? 'border-gray-700 bg-gray-700 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.noPickup ? 'お迎えの送迎を戻す' : 'お迎えは送迎なし（保護者）'}
          </button>
          <button
            type="button"
            onClick={() => update({ noDropoff: !s.noDropoff })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              s.noDropoff ? 'border-gray-700 bg-gray-700 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.noDropoff ? '帰りの送迎を戻す' : '帰りは送迎なし（保護者）'}
          </button>
        </div>
      </div>

      {/* 記録される中身 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm" data-testid="easy-summary">
        <div className="text-xs text-gray-400 mb-1">この内容で記録されます</div>
        {lines.map((l) => <div key={l} className="font-medium text-gray-800">{l}</div>)}
        <div className="text-gray-600 text-xs mt-1">{pickupText}　{dropoffText}</div>
        <div className="text-gray-500 text-xs mt-0.5">
          送迎加算 {transportCount}回（{s.kind === 'ni' ? '日中一時の請求' : s.kind === 'both' ? 'お迎え＝放デイ・帰り＝日中一時' : '国保連の請求'}）
        </div>
      </div>
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onOpenDetail} className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
          {detailOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {detailOpen ? 'くわしい入力を閉じる' : 'くわしく直す（今の入力画面）'}
        </button>
        <Button size="sm" onClick={handleSave} disabled={saving || !!error} className="px-6">
          {saved ? <><Check className="h-3.5 w-3.5" />保存しました</> : saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  )
}
