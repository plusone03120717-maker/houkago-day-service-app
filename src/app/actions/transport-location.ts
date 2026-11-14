'use server'

import { createClient } from '@/lib/supabase/server'
import { getStaffAccess } from '@/lib/require-admin'
import { canEditTransport, canEditUsagePlans } from '@/lib/roles'
import { isCancelMarkerOverride, pickPrimaryPlanPerChild } from '@/lib/schedule-defaults'
import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'
import { getTodayJST } from '@/lib/utils'

type LocationType = 'home' | 'school'

/**
 * 送迎管理の行（transport_details）は、その日の送迎を作ったときの乗車場所を
 * 文字で持つ。あとから利用スケジュールや送迎設定でお迎え場所を変えても、
 * 作ってある先の日の行は前の場所のまま残り、送迎管理に古い場所が出ていた
 * （2026-11-14 依頼主：学校に変えたのに自宅のまま）。
 *
 * お迎え場所を変えたときにこれを呼び、今日以降のお迎えの行を今の設定にそろえる。
 * 決め方は送迎を作るとき（autoCreateTransportSchedules）と同じ
 * 「その日の予約 ＞ 特定日の上書き ＞ 曜日別設定 ＞ 計画」。
 *
 * 書きかえないもの:
 * - 送迎管理で自宅・学校以外（祖父母宅など）を手で選んだ行
 * - 学校へ変える日が土日・祝日の行（学校が休みなので、自宅のお迎えのまま）
 * - 計画も予約も見つからない日・キャンセルした日の行
 */
async function syncFuturePickupRows(childId: string): Promise<number> {
  const supabase = await createClient()
  const today = getTodayJST()

  const [{ data: rowsRaw }, { data: childRaw }] = await Promise.all([
    supabase
      .from('transport_details')
      .select('id, pickup_location, transport_schedules!inner(date, direction, unit_id)')
      .eq('child_id', childId)
      .eq('transport_schedules.direction', 'pickup')
      .gte('transport_schedules.date', today),
    supabase
      .from('children')
      .select('address, schools(name)')
      .eq('id', childId)
      .maybeSingle(),
  ])

  type Row = {
    id: string
    pickup_location: string | null
    transport_schedules: { date: string; direction: string; unit_id: string } | null
  }
  const rows = ((rowsRaw ?? []) as unknown as Row[]).filter((r) => r.transport_schedules)
  if (rows.length === 0 || !childRaw) return 0

  const child = childRaw as unknown as { address: string | null; schools: { name: string } | null }
  const homeValue = child.address ?? null
  const schoolValue = child.schools?.name ?? null
  const dates = [...new Set(rows.map((r) => r.transport_schedules!.date))]

  const { data: plansRaw } = await supabase
    .from('usage_plans')
    .select('id, child_id, unit_id, day_of_week, start_date, end_date, pickup_location_type')
    .eq('child_id', childId)
    .eq('is_active', true)
  type Plan = {
    id: string
    child_id: string
    unit_id: string
    day_of_week: number[] | null
    start_date: string
    end_date: string | null
    pickup_location_type: string | null
  }
  const plans = (plansRaw ?? []) as unknown as Plan[]
  const planIds = plans.map((p) => p.id)

  const [{ data: daySettingsRaw }, { data: overridesRaw }, { data: reservationsRaw }] = await Promise.all([
    planIds.length > 0
      ? supabase
          .from('usage_plan_day_settings')
          .select('plan_id, day_of_week, pickup_location_type')
          .in('plan_id', planIds)
      : Promise.resolve({ data: [] }),
    planIds.length > 0
      ? supabase
          .from('usage_plan_date_overrides')
          .select('plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
          .in('plan_id', planIds)
          .in('date', dates)
      : Promise.resolve({ data: [] }),
    supabase
      .from('usage_reservations')
      .select('unit_id, date, pickup_location_type, pickup_address_id')
      .eq('child_id', childId)
      .in('date', dates)
      .in('status', ['confirmed', 'reserved']),
  ])

  type DaySetting = { plan_id: string; day_of_week: number; pickup_location_type: string | null }
  type Override = {
    plan_id: string
    date: string
    transport_type: string | null
    pickup_location_type: string | null
    pickup_time: string | null
    dropoff_time: string | null
    service_start_time: string | null
    service_end_time: string | null
    is_cancelled: boolean | null
  }
  type Reservation = { unit_id: string; date: string; pickup_location_type: string | null; pickup_address_id: string | null }
  const daySettings = (daySettingsRaw ?? []) as unknown as DaySetting[]
  const overrides = (overridesRaw ?? []) as unknown as Override[]
  const reservations = (reservationsRaw ?? []) as unknown as Reservation[]

  // その日だけ指定された登録住所（祖父母宅など）
  const addressIds = [...new Set(reservations.map((r) => r.pickup_address_id).filter((v): v is string => !!v))]
  const addressById = new Map<string, string>()
  if (addressIds.length > 0) {
    const { data: addressRows } = await supabase
      .from('child_addresses')
      .select('id, address')
      .in('id', addressIds)
    for (const a of (addressRows ?? []) as { id: string; address: string }[]) addressById.set(a.id, a.address)
  }

  let updated = 0
  for (const row of rows) {
    const current = row.pickup_location
    // 自宅・学校以外を手で選んだ行はそのまま
    if (current !== homeValue && current !== schoolValue) continue

    const { date, unit_id: unitId } = row.transport_schedules!
    const dow = new Date(`${date}T00:00:00`).getDay()

    let type: string | null = null
    let cancelled = false
    const candidates = plans.filter((p) =>
      p.unit_id === unitId &&
      p.start_date <= date &&
      (p.end_date == null || p.end_date >= date) &&
      (p.day_of_week ?? []).includes(dow)
    )
    const plan = pickPrimaryPlanPerChild(candidates)[0]
    if (plan) {
      const override = overrides.find((o) => o.plan_id === plan.id && o.date === date)
      if (override?.is_cancelled) {
        cancelled = true
      } else if (override && !isCancelMarkerOverride(override)) {
        type = override.pickup_location_type
      } else {
        type = daySettings.find((d) => d.plan_id === plan.id && d.day_of_week === dow)?.pickup_location_type
          ?? plan.pickup_location_type
          ?? 'home'
      }
    }

    // その日の予約で場所が指定されていればそちらが優先
    const reservation = reservations.find((r) => r.unit_id === unitId && r.date === date)
    if (reservation?.pickup_location_type) type = reservation.pickup_location_type
    if (!type || (cancelled && !reservation)) continue

    const chosenAddress = reservation?.pickup_address_id
      ? addressById.get(reservation.pickup_address_id) ?? null
      : null
    const expected = type === 'school' ? schoolValue : (chosenAddress ?? homeValue)
    if (!expected || expected === current) continue

    // 学校が休みの日（土日・祝日）を学校のお迎えには変えない
    if (type === 'school' && (dow === 0 || dow === 6 || isJapaneseNationalHoliday(date))) continue

    const { error } = await supabase
      .from('transport_details')
      .update({ pickup_location: expected })
      .eq('id', row.id)
    if (!error) updated++
  }
  return updated
}

/**
 * 利用スケジュール（計画・曜日別設定・特定日の上書き）でお迎え場所を変えたあとに呼ぶ。
 * 戻り値は書きかえた送迎の行の数。
 */
export async function refreshFuturePickupLocations(childId: string): Promise<{ updated: number }> {
  const access = await getStaffAccess()
  if (!access) return { updated: 0 }
  const allowed =
    canEditUsagePlans(access.role, access.jobTitles) || canEditTransport(access.role, access.jobTitles)
  if (!allowed) return { updated: 0 }
  return { updated: await syncFuturePickupRows(childId) }
}

/**
 * 児童の「送迎設定」でお迎え場所を変えたときに呼ぶ。
 * 送迎設定は新しい利用スケジュールの初期値で、送迎管理が見るのは利用スケジュールの方。
 * そのため送迎設定だけ変えても送迎管理は変わらなかった。
 *
 * 今日以降も使う利用スケジュールのうち、前の場所のままの計画・曜日別設定を新しい場所にそろえ、
 * 先の日の送迎の行も書きかえる。特定日の上書きはその日だけの指定なので変えない。
 * 利用スケジュールを編集できない人（施設長・スタッフ）のときは何もしない。
 */
export async function applyChildPickupLocation(
  childId: string,
  from: LocationType,
  to: LocationType
): Promise<{ ok: boolean; plansUpdated: number; rowsUpdated: number }> {
  const access = await getStaffAccess()
  if (!access || !canEditUsagePlans(access.role, access.jobTitles)) {
    return { ok: false, plansUpdated: 0, rowsUpdated: 0 }
  }
  if (from === to) return { ok: true, plansUpdated: 0, rowsUpdated: 0 }

  const supabase = await createClient()
  const today = getTodayJST()

  const { data: plansRaw } = await supabase
    .from('usage_plans')
    .select('id')
    .eq('child_id', childId)
    .eq('is_active', true)
    .or(`end_date.is.null,end_date.gte.${today}`)
  const planIds = ((plansRaw ?? []) as { id: string }[]).map((p) => p.id)

  let plansUpdated = 0
  if (planIds.length > 0) {
    const [{ data: changedPlans }] = await Promise.all([
      supabase
        .from('usage_plans')
        .update({ pickup_location_type: to })
        .in('id', planIds)
        .eq('pickup_location_type', from)
        .select('id'),
      supabase
        .from('usage_plan_day_settings')
        .update({ pickup_location_type: to })
        .in('plan_id', planIds)
        .eq('pickup_location_type', from),
    ])
    plansUpdated = (changedPlans ?? []).length
  }

  const rowsUpdated = await syncFuturePickupRows(childId)
  return { ok: true, plansUpdated, rowsUpdated }
}
