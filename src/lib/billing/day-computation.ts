// 請求の日別判定ロジック。
// 児童別月次サービス実績（クライアント）と、出席実績からの再集計（サーバー）の
// 両方がこのモジュールを使う。ここを唯一の判定基準にして、画面表示と請求明細が
// 食い違わないようにする。

import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'

export type ServiceTriggerField =
  | 'basic'
  | 'transport_pickup'
  | 'transport_dropoff'
  | 'daytime_support'
  | 'daytime_pickup'
  | 'daytime_dropoff'
  | 'absent'
  | 'extension'
  | 'manual'

export type ServiceItemLike = {
  id: string
  name: string
  category: '基本' | '加算' | '保険外'
  trigger_field: ServiceTriggerField
}

export type AttendanceLike = {
  id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  pickup_arrival_time: string | null
  dropoff_arrival_time: string | null
  daytime_support: boolean
  daytime_pickup_arrival_time: string | null
  daytime_dropoff_arrival_time: string | null
}

export type DailyRecordLike = {
  date: string
  service_item_id: string | null
  is_checked: boolean
  billing_start_time: string | null
  billing_end_time: string | null
}

export type SchoolHolidayLike = {
  start_date: string
  end_date: string
}

export type ComputedDay = {
  date: string
  isAttended: boolean
  isAbsent: boolean
  isSchoolHoliday: boolean
  /** 1=平日（提供形態①） 2=学校休業日・土日祝（提供形態②） */
  serviceFormType: 1 | 2
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  hoursCalculated: number
  /** 0=30分未満 1=30分以上90分以下 2=90分超 / null=時刻未入力 */
  billingCategory: 0 | 1 | 2 | null
  transportPickup: boolean
  transportDropoff: boolean
  daytimeSupport: boolean
  daytimeTransportPickup: boolean
  daytimeTransportDropoff: boolean
  extensionHours: number
  participatedActivities: Set<string>
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function calcHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0
  const dur = timeToMinutes(endTime) - timeToMinutes(startTime)
  if (dur <= 0) return 0
  return Math.floor(dur / 30) * 0.5
}

export function getBillingCategory(minutes: number, hasValidTimes: boolean): 0 | 1 | 2 | null {
  if (!hasValidTimes) return null
  if (minutes < 30) return 0   // 30分未満
  if (minutes <= 90) return 1  // 30分以上〜90分以下
  return 2                     // 90分超
}

/** 土日・児童個別の学校休日・施設カレンダーの休日・国民の祝日のいずれかなら true */
export function isHolidayDate(
  dateStr: string,
  schoolHolidays: SchoolHolidayLike[],
  facilityHolidays: Iterable<string>,
): boolean {
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  if (dow === 0 || dow === 6) return true
  if (schoolHolidays.some((h) => h.start_date <= dateStr && dateStr <= h.end_date)) return true
  for (const d of facilityHolidays) {
    if (d === dateStr) return true
  }
  return isJapaneseNationalHoliday(dateStr)
}

/** 延長加算の算定基準時間（分）。平日3時間・休日5時間を超えた分を1時間単位で数える */
export function extensionThresholdMinutes(serviceFormType: 1 | 2): number {
  return serviceFormType === 1 ? 180 : 300
}

export function computeBillingDay(params: {
  date: string
  attendance: AttendanceLike | null
  /** その日の billing_daily_records（全項目分） */
  dailyRecords: DailyRecordLike[]
  /** 時刻上書きの参照元を特定するための基本報酬項目 */
  basicItemIds: Set<string>
  isHoliday: boolean
  participatedActivities: Set<string>
}): ComputedDay {
  const { date, attendance: att, dailyRecords, basicItemIds, isHoliday, participatedActivities } = params

  const isAttended = att?.status === 'attended'
  const isAbsent = att?.status === 'absent'
  const serviceFormType: 1 | 2 = isHoliday ? 2 : 1

  // 基本報酬行に入力された請求用時刻があればそれを優先する
  const basicRecord = dailyRecords.find(
    (r) => r.date === date && r.service_item_id != null && basicItemIds.has(r.service_item_id),
  )
  const startTime = basicRecord?.billing_start_time ?? att?.service_start_time ?? att?.check_in_time ?? null
  const endTime = basicRecord?.billing_end_time ?? att?.service_end_time ?? att?.check_out_time ?? null

  const rawMinutes = startTime && endTime ? Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime)) : 0
  const billingCategory = getBillingCategory(rawMinutes, startTime !== null && endTime !== null)
  const extensionHours = isAttended
    ? Math.max(0, Math.floor((rawMinutes - extensionThresholdMinutes(serviceFormType)) / 60))
    : 0

  return {
    date,
    isAttended,
    isAbsent,
    isSchoolHoliday: isHoliday,
    serviceFormType,
    startTime: startTime?.slice(0, 5) ?? null,
    endTime: endTime?.slice(0, 5) ?? null,
    durationMinutes: rawMinutes,
    hoursCalculated: calcHours(startTime, endTime),
    billingCategory,
    // 実際の到着時刻が記録されている場合のみ送迎ありと判定（pickup_type は計画値のため使わない）
    // "00:00:00" は時刻未入力での誤保存として送迎なしとみなす
    transportPickup: att ? att.pickup_arrival_time != null && att.pickup_arrival_time > '00:00:00' : false,
    transportDropoff: att ? att.dropoff_arrival_time != null && att.dropoff_arrival_time > '00:00:00' : false,
    daytimeSupport: att?.daytime_support ?? false,
    daytimeTransportPickup: att
      ? att.daytime_pickup_arrival_time != null && att.daytime_pickup_arrival_time > '00:00:00'
      : false,
    daytimeTransportDropoff: att
      ? att.daytime_dropoff_arrival_time != null && att.daytime_dropoff_arrival_time > '00:00:00'
      : false,
    extensionHours,
    participatedActivities,
  }
}

/** 出席実績からその項目が自動でチェックされるか */
export function isAutoTriggered(item: ServiceItemLike, d: ComputedDay): boolean {
  // 欠席時加算は欠席日のみ（出席チェックより先に評価）
  if (item.trigger_field === 'absent') return d.isAbsent
  if (!d.isAttended) return false
  switch (item.trigger_field) {
    case 'basic': return true
    case 'transport_pickup': return d.transportPickup
    case 'transport_dropoff': return d.transportDropoff
    case 'daytime_support': return d.daytimeSupport
    case 'daytime_pickup': return d.daytimeSupport && d.daytimeTransportPickup
    case 'daytime_dropoff': return d.daytimeSupport && d.daytimeTransportDropoff
    case 'extension': return d.extensionHours > 0
    case 'manual': return d.participatedActivities.has(item.name)
    default: return false
  }
}

/** 手動上書き（billing_daily_records）を加味した最終的なチェック状態 */
export function isItemChecked(
  item: ServiceItemLike,
  d: ComputedDay,
  manualRecord: DailyRecordLike | undefined,
): boolean {
  if (manualRecord !== undefined) return manualRecord.is_checked
  return isAutoTriggered(item, d)
}

/** その日その項目の算定回数。延長加算のみ時間数、それ以外は1回 */
export function getItemQuantity(item: ServiceItemLike, d: ComputedDay): number {
  if (item.trigger_field === 'extension') return d.extensionHours
  return 1
}

/** 月次グリッドの〇の中に表示する値 */
export function getCircleValue(item: ServiceItemLike, d: ComputedDay): number {
  if (item.trigger_field === 'basic') return d.billingCategory ?? 1
  if (item.trigger_field === 'extension') return d.extensionHours
  return 1
}
