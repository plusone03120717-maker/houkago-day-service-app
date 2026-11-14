/**
 * 「この日はなぜこうなっているか」を項目ごとに組み立てる（2026-11-14 依頼主：
 * いろいろな予定がぶつかったとき、どれが優先されるかが分かりにくい）。
 *
 * 決め方は送迎管理・出席管理と同じ関数を使う（自分で順番を持たない）：
 *   - 送迎区分・時刻 … resolveScheduleDefaults（@/lib/schedule-defaults）
 *   - お迎え場所・送り先 … decidePickupLocation / decideDropoffLocation（@/lib/pickup-location）
 * 決まり：その日に人が決めたこと（保護者の利用連絡 ＞ 特定日の変更）＞ いつもの予定。
 * 出席の記録に入った項目は、記録が正。
 */
import {
  isCancelMarkerOverride,
  pickPrimaryPlanPerChild,
  resolveScheduleDefaults,
  transportTimeOf,
  type OverrideRow,
  type PlanRow,
  type ReservationRow,
  type ScheduleSource,
} from '@/lib/schedule-defaults'
import { decideDropoffLocation, decidePickupLocation, type PickupDecision } from '@/lib/pickup-location'
import { placeLabel, toPlaceValue, type TransportPlace } from '@/lib/transport-place'

/** 値の元 */
export type ExplainSource =
  | 'plan'      // いつもの予定（利用スケジュール）
  | 'day'       // 曜日別の設定
  | 'override'  // 特定日の変更
  | 'request'   // 保護者の利用連絡
  | 'record'    // 出席の記録
  | 'holiday'   // 土日・祝日のため自宅
  | 'cancel'    // キャンセル
  | 'none'      // 決める材料がない

export const EXPLAIN_SOURCE_LABELS: Record<ExplainSource, string> = {
  plan: 'いつもの予定',
  day: '曜日別の設定',
  override: '特定日の変更',
  request: '保護者の利用連絡',
  record: '出席の記録',
  holiday: '土日・祝日のため',
  cancel: 'キャンセル',
  none: '指定なし',
}

export type ExplainItem = {
  label: string
  value: string
  source: ExplainSource
  /** いつもの予定の値（効いている値と違うときだけ） */
  usual?: string
}

export type DayExplain = {
  items: ExplainItem[]
  /**
   * その日だけ人が決めたことで、いつもの予定と違う日（保護者の利用連絡・特定日の変更・キャンセル）。
   * 出席の記録の時刻が予定と少し違うだけの日は含めない（毎日のことで、印が多すぎるため）
   */
  hasException: boolean
}

const TRANSPORT_LABELS: Record<string, string> = {
  none: '送迎なし',
  pickup_only: '行きのみ',
  dropoff_only: '帰りのみ',
  both: '行き・帰り両方',
}

export type ExplainPlan = PlanRow & {
  unit_id: string
  start_date: string
  end_date: string | null
  day_of_week: number[] | null
  is_active: boolean
  pickup_location_type: string | null
  dropoff_location_type: string | null
}
export type ExplainDaySetting = OverrideRow & {
  day_of_week: number
  pickup_location_type: string | null
  dropoff_location_type: string | null
}
export type ExplainOverride = OverrideRow & {
  date: string
  is_cancelled: boolean
  pickup_location_type: string | null
  dropoff_location_type: string | null
}
export type ExplainReservation = ReservationRow & {
  unit_id: string
  date: string
  status: string
  pickup_location_type?: string | null
  dropoff_location_type?: string | null
  pickup_address_id?: string | null
  dropoff_address_id?: string | null
}
export type ExplainAttendance = {
  date: string
  status: string
  pickup_departure_time?: string | null
  pickup_arrival_time?: string | null
  dropoff_departure_time?: string | null
  dropoff_arrival_time?: string | null
  service_start_time?: string | null
  service_end_time?: string | null
}

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)
const mapSource = (s: ScheduleSource): ExplainSource => s

export function explainDay(input: {
  date: string
  plans: ExplainPlan[]
  daySettings: ExplainDaySetting[]
  overrides: ExplainOverride[]
  reservations: ExplainReservation[]
  attendance: ExplainAttendance | undefined
  places: TransportPlace[]
}): DayExplain | null {
  const { date, attendance, places } = input
  const dow = new Date(`${date}T00:00:00`).getDay()

  const dayPlans = input.plans.filter((p) =>
    p.is_active &&
    p.start_date <= date &&
    (p.end_date == null || p.end_date >= date) &&
    (p.day_of_week ?? []).includes(dow)
  )
  const plan = pickPrimaryPlanPerChild(dayPlans)[0]
  const override = plan ? input.overrides.find((o) => o.plan_id === plan.id && o.date === date) : undefined
  const cancelled = !!override?.is_cancelled
  const liveOverride = override && !cancelled && !isCancelMarkerOverride(override) ? override : undefined
  const daySetting = plan ? input.daySettings.find((d) => d.plan_id === plan.id && d.day_of_week === dow) : undefined
  const reservations = input.reservations.filter((r) => r.date === date)
  const reservation =
    (plan && reservations.find((r) => r.unit_id === plan.unit_id)) ?? reservations[0]
  const liveReservation = reservation && (reservation.status === 'confirmed' || reservation.status === 'reserved')
    ? reservation
    : undefined

  if (!plan && !reservation && !attendance) return null

  const items: ExplainItem[] = []
  let exception = false

  // ── 来るかどうか ──
  if (attendance) {
    const v = attendance.status === 'attended' ? '出席' : attendance.status === 'absent' ? '欠席' : '利用予定（記録あり）'
    items.push({ label: '利用', value: v, source: 'record' })
  } else if (cancelled || reservation?.status === 'cancelled') {
    items.push({ label: '利用', value: 'キャンセル', source: 'cancel', usual: plan ? 'あり' : undefined })
    exception = true
  } else if (reservation?.status === 'cancel_waiting') {
    items.push({ label: '利用', value: 'キャンセル待ち', source: 'request', usual: plan ? 'あり' : undefined })
    exception = true
  } else if (plan) {
    items.push({ label: '利用', value: 'あり', source: 'plan' })
  } else {
    items.push({ label: '利用', value: 'あり（この日だけ）', source: liveReservation?.transport_type || liveReservation?.pickup_time ? 'request' : 'none' })
    exception = true
  }
  if (items[0].value === 'キャンセル' || items[0].value === '欠席') {
    return { items, hasException: exception }
  }

  // ── 送迎区分・時刻（resolveScheduleDefaults と同じ決め方） ──
  let transportType = liveReservation?.transport_type ?? 'both'
  let pickupTime: string | null = liveReservation?.pickup_time ?? null
  let dropoffTime: string | null = liveReservation?.dropoff_time ?? null
  let serviceStart: string | null = null
  let serviceEnd: string | null = null
  let transportSource: ExplainSource = liveReservation?.transport_type ? 'request' : 'none'
  let pickupSource: ExplainSource = liveReservation?.pickup_time ? 'request' : 'none'
  let dropoffSource: ExplainSource = liveReservation?.dropoff_time ? 'request' : 'none'
  let serviceSource: ExplainSource = 'none'
  let usualTransport: string | null = null
  let usualPickupTime: string | null = null
  let usualDropoffTime: string | null = null

  if (plan && !cancelled) {
    const eff = resolveScheduleDefaults(
      [plan],
      daySetting ? [daySetting] : [],
      liveOverride ? [liveOverride] : [],
      liveReservation ? [liveReservation] : []
    )[plan.child_id]
    const usual = resolveScheduleDefaults([plan], daySetting ? [daySetting] : [], [], [])[plan.child_id]
    if (eff) {
      transportType = eff.transportType
      pickupTime = eff.pickupTime
      dropoffTime = eff.dropoffTime
      serviceStart = eff.serviceStartTime
      serviceEnd = eff.serviceEndTime
      transportSource = mapSource(eff.sources!.transportType)
      pickupSource = mapSource(eff.sources!.pickupTime)
      dropoffSource = mapSource(eff.sources!.dropoffTime)
      serviceSource = mapSource(eff.sources!.serviceTime)
    }
    if (usual) {
      usualTransport = usual.transportType
      usualPickupTime = usual.pickupTime
      usualDropoffTime = usual.dropoffTime
    }
  }

  const isDayChoice = (s: ExplainSource) => s === 'request' || s === 'override'

  items.push({
    label: '送迎',
    value: TRANSPORT_LABELS[transportType] ?? transportType,
    source: transportSource,
    usual: usualTransport && usualTransport !== transportType ? TRANSPORT_LABELS[usualTransport] ?? usualTransport : undefined,
  })
  if (isDayChoice(transportSource) && usualTransport !== transportType) exception = true

  const usesPickup = transportType === 'both' || transportType === 'pickup_only'
  const usesDropoff = transportType === 'both' || transportType === 'dropoff_only'

  // ── お迎え場所・送り先（decide*Location と同じ決め方） ──
  const common = {
    date,
    dayPlanType: plan && !cancelled ? plan.pickup_location_type : undefined,
    cancelled,
    overrideType: liveOverride?.pickup_location_type,
    daySettingType: daySetting?.pickup_location_type,
    fallbackPlanType: undefined,
  }
  const placeItem = (label: string, d: PickupDecision, addressId: string | null | undefined, hasDaySetting: boolean) => {
    const value = placeLabel(places, toPlaceValue(d.type, d.type === 'home' ? addressId : null))
    const source: ExplainSource = d.schoolOffAdjusted
      ? 'holiday'
      : d.source === 'plan'
      ? (hasDaySetting ? 'day' : 'plan')
      : d.source
    const usual = d.baseType && (d.baseType !== d.type || (d.type === 'home' && addressId && d.source === 'request'))
      ? placeLabel(places, toPlaceValue(d.baseType, null))
      : undefined
    items.push({ label, value, source, usual })
    if (isDayChoice(source) && usual) exception = true
  }
  if (usesPickup) {
    placeItem(
      'お迎え',
      decidePickupLocation({
        ...common,
        reservation: reservation ? { pickup_location_type: liveReservation?.pickup_location_type ?? null } : null,
      }),
      liveReservation?.pickup_address_id,
      !!daySetting?.pickup_location_type
    )
  }
  if (usesDropoff) {
    placeItem(
      '送り',
      decideDropoffLocation({
        ...common,
        dayPlanType: plan && !cancelled ? plan.dropoff_location_type : undefined,
        overrideType: liveOverride?.dropoff_location_type,
        daySettingType: daySetting?.dropoff_location_type,
        reservation: reservation ? { dropoff_location_type: liveReservation?.dropoff_location_type ?? null } : null,
      }),
      liveReservation?.dropoff_address_id,
      !!daySetting?.dropoff_location_type
    )
  }

  // ── 時刻（記録があれば記録が正） ──
  const timeItem = (label: string, planned: string | null, plannedSource: ExplainSource, recorded: string | null, usual: string | null) => {
    if (recorded) {
      const differs = !!planned && hm(planned) !== recorded
      items.push({ label, value: recorded, source: 'record', usual: differs ? hm(planned) ?? undefined : undefined })
    } else if (planned) {
      items.push({ label, value: hm(planned)!, source: plannedSource, usual: usual && hm(usual) !== hm(planned) ? hm(usual) ?? undefined : undefined })
      if (isDayChoice(plannedSource) && usual && hm(usual) !== hm(planned)) exception = true
    }
  }
  if (usesPickup) {
    timeItem('迎えの時刻', pickupTime, pickupSource, transportTimeOf(attendance?.pickup_departure_time, attendance?.pickup_arrival_time), usualPickupTime)
  }
  if (usesDropoff) {
    timeItem('送りの時刻', dropoffTime, dropoffSource, transportTimeOf(attendance?.dropoff_departure_time, attendance?.dropoff_arrival_time), usualDropoffTime)
  }
  const recordedService = attendance?.service_start_time
    ? `${hm(attendance.service_start_time)}〜${hm(attendance.service_end_time) ?? ''}`
    : null
  const plannedService = serviceStart ? `${hm(serviceStart)}〜${hm(serviceEnd) ?? ''}` : null
  if (recordedService) items.push({ label: '利用時間', value: recordedService, source: 'record' })
  else if (plannedService) items.push({ label: '利用時間', value: plannedService, source: serviceSource })

  return { items, hasException: exception }
}
