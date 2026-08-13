// 出席実績（daily_attendance / billing_daily_records）と単位数マスタから
// 児童ごとの請求明細を組み立てる。児童別月次サービス実績の画面表示と同じ
// 判定ロジック（lib/billing/day-computation）を使うため、画面と請求明細が一致する。

import type { createClient } from '@/lib/supabase/server'
import {
  computeBillingDay,
  getItemQuantity,
  isItemChecked,
  isHolidayDate,
  type AttendanceLike,
  type DailyRecordLike,
  type ServiceItemLike,
} from './day-computation'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export type BreakdownLine = {
  /** 国保連サービスコード（6桁）。未設定は null */
  code: string | null
  name: string
  /** 1回あたり単位数 */
  unitCount: number
  /** 回数 */
  count: number
  /** unitCount × count */
  units: number
}

export type ChildAggregate = {
  childId: string
  childName: string
  certificateId: string | null
  totalDays: number
  totalUnits: number
  breakdown: BreakdownLine[]
  /** 基本報酬の代表サービスコード（単位数が最大のもの） */
  serviceCode: string | null
  unitPrice: number
  totalCost: number
  copayLimit: number
  copayAmount: number
  billedAmount: number
  errors: string[]
}

export type UnitMonthAggregate = {
  unitId: string
  yearMonth: string
  unitPrice: number
  children: ChildAggregate[]
  /** 集計そのものは成立するが確認してほしい事項 */
  warnings: string[]
  /** 集計を実行できなかった理由 */
  fatal: string | null
}

type ServiceItemRow = ServiceItemLike & {
  billing_code: string | null
  unit_count: number
}

type BasicRateRow = {
  service_form_type: number
  billing_category: number
  unit_count: number
  billing_code: string | null
}

type CertRow = {
  id: string
  child_id: string
  start_date: string
  end_date: string
  copay_limit: number
  max_days_per_month: number
  contract_amount: number | null
}

const CATEGORY_LABEL: Record<number, string> = {
  0: '30分未満',
  1: '区分1',
  2: '区分2',
}
const FORM_LABEL: Record<number, string> = {
  1: '平日',
  2: '休日',
}

function monthRange(yearMonth: string): { start: string; end: string; days: string[] } {
  const year = parseInt(yearMonth.slice(0, 4))
  const month = parseInt(yearMonth.slice(4, 6))
  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Array.from({ length: lastDay }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`)
  return { start: days[0], end: days[days.length - 1], days }
}

/** 日付を「7/3, 7/5 ほか2日」の形にまとめる（エラー文が長くなりすぎないように） */
function summarizeDates(dates: string[]): string {
  const shown = dates.slice(0, 2).map((d) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`)
  const rest = dates.length - shown.length
  return rest > 0 ? `${shown.join(', ')} ほか${rest}日` : shown.join(', ')
}

export async function aggregateUnitMonth(
  supabase: SupabaseLike,
  unitId: string,
  yearMonth: string,
): Promise<UnitMonthAggregate> {
  const { start, end, days } = monthRange(yearMonth)
  const warnings: string[] = []
  const empty = (fatal: string): UnitMonthAggregate => ({
    unitId, yearMonth, unitPrice: 10, children: [], warnings, fatal,
  })

  // ── 施設（単位数単価） ────────────────────────────────────
  const { data: unitRow } = await supabase
    .from('units')
    .select('id, facility_id, facilities (id, unit_price)')
    .eq('id', unitId)
    .maybeSingle()
  if (!unitRow) return empty('ユニットが見つかりません')

  const facility = (unitRow as unknown as { facilities: { id: string; unit_price: number } | null }).facilities
  const facilityId = facility?.id ?? null
  const unitPrice = Number(facility?.unit_price ?? 10)
  if (!facility) {
    warnings.push('施設情報が取得できないため、単位数単価を10.000円として計算しました')
  }

  // ── 単位数マスタ ──────────────────────────────────────────
  const [{ data: itemsRaw }, { data: ratesRaw }] = await Promise.all([
    supabase
      .from('billing_service_items')
      .select('id, name, category, trigger_field, billing_code, unit_count')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('billing_basic_rates')
      .select('service_form_type, billing_category, unit_count, billing_code')
      .eq('unit_id', unitId),
  ])
  const serviceItems = (itemsRaw ?? []) as ServiceItemRow[]
  const basicRates = (ratesRaw ?? []) as BasicRateRow[]
  if (serviceItems.length === 0) {
    return empty('サービス項目が登録されていません（児童別の月次サービス実績で「標準項目を追加」を実行してください）')
  }
  const rateMap = new Map(basicRates.map((r) => [`${r.service_form_type}-${r.billing_category}`, r]))
  if (basicRates.length === 0) {
    warnings.push('基本報酬の単位数が未登録です（設定 → 国保連サービスコード・単位数設定）')
  }

  const basicItemIds = new Set(
    serviceItems.filter((i) => i.trigger_field === 'basic').map((i) => i.id),
  )

  // ── 出席実績 ──────────────────────────────────────────────
  const { data: attRaw } = await supabase
    .from('daily_attendance')
    .select(
      'id, child_id, date, status, check_in_time, check_out_time, service_start_time, service_end_time,' +
      ' pickup_arrival_time, dropoff_arrival_time, daytime_support,' +
      ' daytime_pickup_arrival_time, daytime_dropoff_arrival_time,' +
      ' children (id, name)',
    )
    .eq('unit_id', unitId)
    .gte('date', start)
    .lte('date', end)
    .in('status', ['attended', 'absent'])
  const attendances = (attRaw ?? []) as unknown as Array<
    AttendanceLike & { child_id: string; children: { id: string; name: string } | null }
  >

  if (attendances.length === 0) {
    return { unitId, yearMonth, unitPrice, children: [], warnings, fatal: null }
  }

  const childIds = Array.from(new Set(attendances.map((a) => a.child_id)))
  const attendedIds = attendances.filter((a) => a.status === 'attended').map((a) => a.id)

  // ── 手動上書き・休日・活動・受給者証 ──────────────────────
  const [
    { data: recordsRaw },
    { data: schoolHolidaysRaw },
    { data: facilityHolidaysRaw },
    { data: activitiesRaw },
    { data: certsRaw },
  ] = await Promise.all([
    supabase
      .from('billing_daily_records')
      .select('child_id, date, service_item_id, is_checked, billing_start_time, billing_end_time')
      .eq('unit_id', unitId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('child_school_holidays')
      .select('child_id, start_date, end_date')
      .in('child_id', childIds)
      .lte('start_date', end)
      .gte('end_date', start),
    facilityId
      ? supabase
          .from('facility_events')
          .select('event_date')
          .eq('facility_id', facilityId)
          .eq('event_type', 'holiday')
          .gte('event_date', start)
          .lte('event_date', end)
      : Promise.resolve({ data: [] }),
    attendedIds.length > 0
      ? supabase
          .from('daily_activities')
          .select('attendance_id, activity_programs(name)')
          .in('attendance_id', attendedIds)
          .eq('participated', true)
      : Promise.resolve({ data: [] }),
    supabase
      .from('benefit_certificates')
      .select('id, child_id, start_date, end_date, copay_limit, max_days_per_month, contract_amount')
      .in('child_id', childIds)
      .lte('start_date', end)
      .gte('end_date', start),
  ])

  const recordsByChild = new Map<string, DailyRecordLike[]>()
  for (const r of (recordsRaw ?? []) as Array<DailyRecordLike & { child_id: string }>) {
    const list = recordsByChild.get(r.child_id) ?? []
    list.push(r)
    recordsByChild.set(r.child_id, list)
  }

  const schoolHolidaysByChild = new Map<string, Array<{ start_date: string; end_date: string }>>()
  for (const h of (schoolHolidaysRaw ?? []) as Array<{ child_id: string; start_date: string; end_date: string }>) {
    const list = schoolHolidaysByChild.get(h.child_id) ?? []
    list.push(h)
    schoolHolidaysByChild.set(h.child_id, list)
  }

  const facilityHolidays = ((facilityHolidaysRaw ?? []) as Array<{ event_date: string }>).map((e) => e.event_date)

  const attIdToDate = new Map(attendances.map((a) => [a.id, a.date]))
  const attIdToChild = new Map(attendances.map((a) => [a.id, a.child_id]))
  const activityMap = new Map<string, Set<string>>() // `${childId}|${date}` → 活動名
  for (const act of (activitiesRaw ?? []) as unknown as Array<{
    attendance_id: string
    activity_programs: { name: string } | null
  }>) {
    const name = act.activity_programs?.name
    const date = attIdToDate.get(act.attendance_id)
    const childId = attIdToChild.get(act.attendance_id)
    if (!name || !date || !childId) continue
    const key = `${childId}|${date}`
    if (!activityMap.has(key)) activityMap.set(key, new Set())
    activityMap.get(key)!.add(name)
  }

  // 月内に有効な受給者証（複数ある場合は開始日が新しいものを採用）
  const certByChild = new Map<string, CertRow>()
  for (const c of ((certsRaw ?? []) as CertRow[]).sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    certByChild.set(c.child_id, c)
  }

  // ── 児童ごとに集計 ────────────────────────────────────────
  const attByChild = new Map<string, typeof attendances>()
  for (const a of attendances) {
    const list = attByChild.get(a.child_id) ?? []
    list.push(a)
    attByChild.set(a.child_id, list)
  }

  const children: ChildAggregate[] = []

  for (const childId of childIds) {
    const childAtts = attByChild.get(childId) ?? []
    const childName = childAtts.find((a) => a.children)?.children?.name ?? '(不明)'
    const dailyRecords = recordsByChild.get(childId) ?? []
    const schoolHolidays = schoolHolidaysByChild.get(childId) ?? []
    const attByDate = new Map(childAtts.map((a) => [a.date, a]))

    const errors: string[] = []
    const lines = new Map<string, BreakdownLine>()
    const missingTimeDates: string[] = []
    const tooShortDates: string[] = []
    const missingRates = new Set<string>()
    const missingItemUnits = new Set<string>()
    let totalDays = 0

    const addLine = (code: string | null, name: string, unitCount: number, count: number) => {
      if (unitCount <= 0 || count <= 0) return
      const key = `${code ?? '-'}|${unitCount}|${name}`
      const prev = lines.get(key)
      if (prev) {
        prev.count += count
        prev.units += unitCount * count
      } else {
        lines.set(key, { code, name, unitCount, count, units: unitCount * count })
      }
    }

    for (const date of days) {
      const att = attByDate.get(date) ?? null
      if (!att) continue

      const day = computeBillingDay({
        date,
        attendance: att,
        dailyRecords,
        basicItemIds,
        isHoliday: isHolidayDate(date, schoolHolidays, facilityHolidays),
        participatedActivities: activityMap.get(`${childId}|${date}`) ?? new Set(),
      })

      for (const item of serviceItems) {
        // 保険外は給付費の対象外（実費管理で扱う）
        if (item.category === '保険外') continue

        const manual = dailyRecords.find((r) => r.date === date && r.service_item_id === item.id)
        if (!isItemChecked(item, day, manual)) continue

        if (item.trigger_field === 'basic') {
          totalDays++
          if (day.billingCategory === null) {
            missingTimeDates.push(date)
            continue
          }
          if (day.billingCategory === 0) {
            tooShortDates.push(date)
            continue
          }
          const rate = rateMap.get(`${day.serviceFormType}-${day.billingCategory}`)
          if (!rate || rate.unit_count <= 0) {
            missingRates.add(`${FORM_LABEL[day.serviceFormType]}・${CATEGORY_LABEL[day.billingCategory]}`)
            continue
          }
          addLine(
            rate.billing_code ?? item.billing_code,
            `${item.name}（${FORM_LABEL[day.serviceFormType]}・${CATEGORY_LABEL[day.billingCategory]}）`,
            rate.unit_count,
            1,
          )
          continue
        }

        const quantity = getItemQuantity(item, day)
        if (quantity <= 0) continue
        if (item.unit_count <= 0) {
          missingItemUnits.add(item.name)
          continue
        }
        addLine(item.billing_code, item.name, item.unit_count, quantity)
      }
    }

    const breakdown = Array.from(lines.values()).sort((a, b) => b.units - a.units)
    const totalUnits = breakdown.reduce((s, l) => s + l.units, 0)

    // 基本報酬の代表コード（明細書の日数情報・集計情報レコードで使うサービス種類の判定に使う）
    const basicNames = serviceItems.filter((i) => i.trigger_field === 'basic').map((i) => i.name)
    const basicLine = breakdown.find((l) => basicNames.some((n) => l.name.startsWith(n)))
    const serviceCode = basicLine?.code ?? breakdown[0]?.code ?? null

    const cert = certByChild.get(childId) ?? null
    const copayLimit = cert?.copay_limit ?? 0
    const totalCost = Math.floor(totalUnits * unitPrice)
    const tenPercent = Math.floor(totalCost / 10)
    const copayAmount = Math.min(copayLimit, tenPercent)
    const billedAmount = totalCost - copayAmount

    if (!cert) {
      errors.push('この月に有効な受給者証がありません（児童詳細 → 受給者証）')
    } else {
      const limitDays = cert.contract_amount ?? cert.max_days_per_month ?? 0
      if (limitDays > 0 && totalDays > limitDays) {
        errors.push(`月の給付量（${limitDays}日）を超過しています: ${totalDays}日`)
      }
    }
    if (missingTimeDates.length > 0) {
      errors.push(`提供時間が未入力のため単位数を算定できない日があります: ${summarizeDates(missingTimeDates)}`)
    }
    if (tooShortDates.length > 0) {
      errors.push(`提供時間が30分未満のため算定対象外の日があります: ${summarizeDates(tooShortDates)}`)
    }
    for (const label of missingRates) {
      errors.push(`基本報酬の単位数が未設定です（${label}）: 設定 → 国保連サービスコード・単位数設定`)
    }
    for (const name of missingItemUnits) {
      errors.push(`「${name}」の単位数が未設定です: 設定 → 国保連サービスコード・単位数設定`)
    }
    if (breakdown.some((l) => !l.code)) {
      const names = breakdown.filter((l) => !l.code).map((l) => l.name)
      errors.push(`サービスコード（6桁）が未設定です: ${names.join('、')}`)
    }

    children.push({
      childId,
      childName,
      certificateId: cert?.id ?? null,
      totalDays,
      totalUnits,
      breakdown,
      serviceCode,
      unitPrice,
      totalCost,
      copayLimit,
      copayAmount,
      billedAmount,
      errors,
    })
  }

  children.sort((a, b) => a.childName.localeCompare(b.childName, 'ja'))

  return { unitId, yearMonth, unitPrice, children, warnings, fatal: null }
}
