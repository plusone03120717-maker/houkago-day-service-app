'use server'

import { createClient } from '@/lib/supabase/server'
import { getStaffAccess } from '@/lib/require-admin'
import { canEditTransport, canEditUsagePlans } from '@/lib/roles'
import { isCancelMarkerOverride, pickPrimaryPlanPerChild } from '@/lib/schedule-defaults'
import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'
import { getTodayJST } from '@/lib/utils'
import type { PickupReviewItem, PickupSyncResult } from '@/lib/pickup-review'

type LocationType = 'home' | 'school'
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PickupPlan = {
  /** 確認なしで新しい場所にそろえる行 */
  auto: { id: string; to: string }[]
  /** 変えるかどうかを人が選ぶ行 */
  review: PickupReviewItem[]
}

/**
 * 送迎管理の行（transport_details）は、その日の送迎を作ったときの乗車場所を
 * 文字で持つ。あとから利用スケジュールや送迎設定でお迎え場所を変えても、
 * 作ってある先の日の行は前の場所のまま残り、送迎管理に古い場所が出ていた
 * （2026-11-14 依頼主：学校に変えたのに自宅のまま）。
 *
 * 今日以降のお迎えの行を、次の2つに分ける（2026-11-14 依頼主：新しい方で上書きし、
 * 注意が要る日は知らせて、変えるかどうかを選べるように）。
 *
 * 確認なしでそろえる（auto）:
 *   自宅の住所・学校名のまま（設定から自動で入った）で、今の設定と違う行
 *
 * 人が選ぶ（review）:
 *   - manual   送迎管理で自宅・学校以外（祖父母宅など）を選んである行。
 *              お迎え場所を変えた方が新しいので、初めは「変える」
 *   - request  保護者の利用連絡でその日の場所が指定されている行。初めは「変えない」
 *   - override 利用スケジュールの特定日の上書きで指定されている行。初めは「変えない」
 *   - holiday  学校にする日が土日・祝日の行。学校が休みなので初めは「変えない」
 *
 * 決め方は送迎を作るとき（autoCreateTransportSchedules）と同じ
 * 「その日の予約 ＞ 特定日の上書き ＞ 曜日別設定 ＞ 計画」。
 *
 * baseChanged は「いつもの場所（計画・曜日別設定）」を変えたか。
 * 特定日の上書きだけを直したときは false にして、ほかの日の request / override /
 * holiday を毎回たずねないようにする。
 */
async function planPickupRows(
  supabase: SupabaseServerClient,
  childId: string,
  baseChanged: boolean
): Promise<PickupPlan> {
  const today = getTodayJST()
  const result: PickupPlan = { auto: [], review: [] }

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
  if (rows.length === 0 || !childRaw) return result

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

  const valueOf = (type: string | null, address: string | null = null) =>
    type === 'school' ? schoolValue : (address ?? homeValue)

  for (const row of rows) {
    const current = row.pickup_location
    const { date, unit_id: unitId } = row.transport_schedules!
    const dow = new Date(`${date}T00:00:00`).getDay()
    const isSchoolOff = dow === 0 || dow === 6 || isJapaneseNationalHoliday(date)

    const candidates = plans.filter((p) =>
      p.unit_id === unitId &&
      p.start_date <= date &&
      (p.end_date == null || p.end_date >= date) &&
      (p.day_of_week ?? []).includes(dow)
    )
    const plan = pickPrimaryPlanPerChild(candidates)[0]
    const reservation = reservations.find((r) => r.unit_id === unitId && r.date === date)

    // いつもの場所（曜日別設定 ＞ 計画）
    let baseType: string | null = null
    let overrideType: string | null = null
    let cancelled = false
    if (plan) {
      const override = overrides.find((o) => o.plan_id === plan.id && o.date === date)
      if (override?.is_cancelled) cancelled = true
      else if (override && !isCancelMarkerOverride(override)) overrideType = override.pickup_location_type
      baseType = daySettings.find((d) => d.plan_id === plan.id && d.day_of_week === dow)?.pickup_location_type
        ?? plan.pickup_location_type
        ?? 'home'
    }
    if (cancelled && !reservation) continue

    // その日だけの指定（保護者の利用連絡 ＞ 特定日の上書き）
    const requestAddress = reservation?.pickup_address_id
      ? addressById.get(reservation.pickup_address_id) ?? null
      : null
    const requested = !!(reservation?.pickup_location_type || requestAddress)
    const daySource: 'request' | 'override' | null =
      requested ? 'request' : overrideType ? 'override' : null
    const effectiveType = reservation?.pickup_location_type ?? overrideType ?? baseType
    if (!effectiveType) continue

    const baseValue = baseType ? valueOf(baseType) : null
    const expected = valueOf(effectiveType, effectiveType === 'home' ? requestAddress : null)
    const isAutoValue = current == null || current === homeValue || current === schoolValue

    // 学校が休みの日は学校のお迎えにしない（変えるかどうかは人が選ぶ）
    if (effectiveType === 'school' && isSchoolOff) {
      if (baseChanged && schoolValue && current !== schoolValue) {
        result.review.push({ id: row.id, date, from: current, to: schoolValue, reason: 'holiday', recommended: false })
      }
      continue
    }

    if (expected && expected !== current) {
      if (isAutoValue) {
        result.auto.push({ id: row.id, to: expected })
      } else {
        // 送迎管理で手で選んだ場所（祖父母宅など）。お迎え場所の変更の方が新しい
        result.review.push({ id: row.id, date, from: current, to: expected, reason: 'manual', recommended: true })
      }
      continue
    }

    // その日だけの指定どおりになっているが、いつもの場所とは違う日
    if (baseChanged && daySource && baseValue && baseValue !== current) {
      const baseIsSchoolOnOffDay = baseType === 'school' && isSchoolOff
      if (!baseIsSchoolOnOffDay) {
        result.review.push({ id: row.id, date, from: current, to: baseValue, reason: daySource, recommended: false })
      }
    }
  }

  result.review.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

async function applyAuto(supabase: SupabaseServerClient, auto: PickupPlan['auto']): Promise<number> {
  let updated = 0
  for (const a of auto) {
    const { error } = await supabase.from('transport_details').update({ pickup_location: a.to }).eq('id', a.id)
    if (!error) updated++
  }
  return updated
}

async function canSync(): Promise<boolean> {
  const access = await getStaffAccess()
  if (!access) return false
  return canEditUsagePlans(access.role, access.jobTitles) || canEditTransport(access.role, access.jobTitles)
}

/**
 * 利用スケジュール（計画・曜日別設定・特定日の上書き）でお迎え場所を変えたあとに呼ぶ。
 * 確認の要らない行はそろえ、変えるかどうかを選ぶ行を返す。
 */
export async function refreshFuturePickupLocations(
  childId: string,
  options: { baseChanged?: boolean } = {}
): Promise<PickupSyncResult> {
  if (!(await canSync())) return { updated: 0, review: [] }
  const supabase = await createClient()
  const plan = await planPickupRows(supabase, childId, options.baseChanged ?? true)
  return { updated: await applyAuto(supabase, plan.auto), review: plan.review }
}

/**
 * 確認の一覧で「変える」を選んだ行だけを書きかえる。
 * 画面から来た id はそのまま信じず、今の状態で選べる行かを確かめてから変える。
 */
export async function applyPickupReview(childId: string, rowIds: string[]): Promise<{ updated: number }> {
  if (rowIds.length === 0 || !(await canSync())) return { updated: 0 }
  const supabase = await createClient()
  const plan = await planPickupRows(supabase, childId, true)
  const chosen = new Set(rowIds)
  return { updated: await applyAuto(supabase, plan.review.filter((r) => chosen.has(r.id))) }
}

/**
 * 児童の「送迎設定」でお迎え場所を変えたときに呼ぶ。
 * 送迎設定は新しい利用スケジュールの初期値で、送迎管理が見るのは利用スケジュールの方。
 * そのため送迎設定だけ変えても送迎管理は変わらなかった。
 *
 * 今日以降も使う利用スケジュールのうち、前の場所のままの計画・曜日別設定を新しい場所にそろえ、
 * 先の日の送迎の行もそろえる（変えるかどうかを選ぶ行は返す）。
 * 特定日の上書きはその日だけの指定なので変えない。
 * 利用スケジュールを編集できない人（施設長・スタッフ）のときは何もしない。
 */
export async function applyChildPickupLocation(
  childId: string,
  from: LocationType,
  to: LocationType
): Promise<{ ok: boolean; plansUpdated: number } & PickupSyncResult> {
  const access = await getStaffAccess()
  if (!access || !canEditUsagePlans(access.role, access.jobTitles)) {
    return { ok: false, plansUpdated: 0, updated: 0, review: [] }
  }
  if (from === to) return { ok: true, plansUpdated: 0, updated: 0, review: [] }

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

  const plan = await planPickupRows(supabase, childId, true)
  return { ok: true, plansUpdated, updated: await applyAuto(supabase, plan.auto), review: plan.review }
}
