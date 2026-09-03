import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * 利用スケジュールから解決した「その日の予定値」。
 *
 * 送迎管理・日々の記録・出席管理はいずれも
 * 「その日の記録（daily_attendance）が空なら、この値を未確定として表示する」
 * という同じ規則で動く。値の解決をここ1か所に集約している。
 *
 * 優先順位: 特定日の上書き > 曜日別設定 > プランのデフォルト
 */
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

export type PlanRow = {
  id: string
  child_id: string
  /** 重複した計画から1本を選ぶのに使う。取得していない画面もあるため任意 */
  start_date?: string | null
  transport_type: string | null
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean | null
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

export type OverrideRow = {
  plan_id: string
  transport_type: string | null
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  is_cancelled?: boolean
}

const PLAN_SELECT =
  'id, child_id, start_date, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, ' +
  'daytime_support, daytime_support_start_time, daytime_support_end_time'

const OVERRIDE_SELECT =
  'plan_id, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time'

/**
 * 同じ児童に該当する利用計画が複数あるときの優先順位。
 *
 * 本来1人1本のはずだが、古い計画に終了日を入れずに新しい計画を足すと
 * 期間・曜日が重なった計画が2本並ぶ。そのままだと出席管理に同じ児童が
 * 2行出たり、どちらの時刻が採用されるかが取得順まかせになるため、
 * 「開始日が新しい方＝あとから決めた取り決め」を採用する。
 * 開始日が同じときは id 順にして、画面をまたいでも結果がぶれないようにする。
 *
 * 重複そのものはデータの誤りなので、入力チェックの overlapping_plans が
 * 別途知らせる（ここは表示を壊さないための受け止めであって、解決ではない）。
 */
export function comparePlanPriority(
  a: { id: string; start_date?: string | null },
  b: { id: string; start_date?: string | null }
): number {
  const as = a.start_date ?? ''
  const bs = b.start_date ?? ''
  if (as !== bs) return as < bs ? 1 : -1
  return a.id.localeCompare(b.id)
}

/** 児童ごとに計画を1本へ絞る（同一ユニット・同一日で絞り込み済みの配列を渡すこと） */
export function pickPrimaryPlanPerChild<T extends { id: string; child_id: string; start_date?: string | null }>(
  plans: T[]
): T[] {
  const byChild = new Map<string, T>()
  for (const p of [...plans].sort(comparePlanPriority)) {
    if (!byChild.has(p.child_id)) byChild.set(p.child_id, p)
  }
  return [...byChild.values()]
}

/**
 * そのユニット・その日に有効な利用計画から、児童ごとの予定値を解決する。
 * `childId` を渡すとその児童だけに絞る。
 * その日がキャンセルされている計画は結果に含めない。
 */
export async function fetchScheduleDefaults(
  supabase: SupabaseServerClient,
  unitId: string,
  date: string,
  childId?: string
): Promise<Record<string, ScheduleDefaults>> {
  if (!unitId) return {}

  const dow = new Date(date).getDay()

  let query = supabase
    .from('usage_plans')
    .select(PLAN_SELECT)
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .contains('day_of_week', [dow])
  if (childId) query = query.eq('child_id', childId)

  const { data: plansRaw } = await query
  const plans = (plansRaw ?? []) as unknown as PlanRow[]
  if (plans.length === 0) return {}

  const planIds = plans.map((p) => p.id)
  const [{ data: daySettingsRaw }, { data: overridesRaw }] = await Promise.all([
    supabase
      .from('usage_plan_day_settings')
      .select(OVERRIDE_SELECT)
      .in('plan_id', planIds)
      .eq('day_of_week', dow),
    supabase
      .from('usage_plan_date_overrides')
      .select(`${OVERRIDE_SELECT}, is_cancelled`)
      .in('plan_id', planIds)
      .eq('date', date),
  ])

  return resolveScheduleDefaults(
    plans,
    (daySettingsRaw ?? []) as unknown as OverrideRow[],
    (overridesRaw ?? []) as unknown as OverrideRow[]
  )
}

/**
 * 取得済みの行から児童ごとの予定値を組み立てる純粋関数。
 * 出席管理は一括 RPC で計画・曜日別設定・上書きをまとめて取得しているため、
 * 取得の仕方は各画面に任せ、優先順位の判断だけをここで共有する。
 */
export function resolveScheduleDefaults(
  plans: PlanRow[],
  daySettings: OverrideRow[],
  overrides: OverrideRow[]
): Record<string, ScheduleDefaults> {
  const cancelledPlanIds = new Set(overrides.filter((o) => o.is_cancelled).map((o) => o.plan_id))
  const daySettingByPlan = new Map(daySettings.map((d) => [d.plan_id, d]))
  const overrideByPlan = new Map(overrides.filter((o) => !o.is_cancelled).map((o) => [o.plan_id, o]))

  // キャンセル済みを外してから1本に絞る。順序を逆にすると、優先された計画が
  // その日だけキャンセルされていた児童の予定値がまるごと消えてしまう。
  const livePlans = pickPrimaryPlanPerChild(plans.filter((p) => !cancelledPlanIds.has(p.id)))

  const result: Record<string, ScheduleDefaults> = {}
  for (const plan of livePlans) {
    const ov = overrideByPlan.get(plan.id)
    const ds = daySettingByPlan.get(plan.id)
    result[plan.child_id] = {
      transportType: ov?.transport_type ?? ds?.transport_type ?? plan.transport_type ?? 'both',
      pickupTime: ov?.pickup_time ?? ds?.pickup_time ?? plan.pickup_time,
      dropoffTime: ov?.dropoff_time ?? ds?.dropoff_time ?? plan.dropoff_time,
      serviceStartTime: ov?.service_start_time ?? ds?.service_start_time ?? plan.service_start_time,
      serviceEndTime: ov?.service_end_time ?? ds?.service_end_time ?? plan.service_end_time,
      daytimeSupport: plan.daytime_support ?? false,
      daytimeSupportStartTime: plan.daytime_support_start_time,
      daytimeSupportEndTime: plan.daytime_support_end_time,
    }
  }
  return result
}

/**
 * daily_attendance に「その日の記録」として確定させる利用時間。
 * 送迎・日中一時パネルと同じく、利用開始が未設定ならお迎え時刻を充てる。
 */
export function scheduleDefaultsToAttendanceFields(s: ScheduleDefaults): Record<string, unknown> {
  const start = s.serviceStartTime ?? s.pickupTime
  const end = s.serviceEndTime
  return {
    service_start_time: start,
    check_in_time: start,
    service_end_time: end,
    check_out_time: end,
    daytime_support: s.daytimeSupport,
    daytime_support_start_time: s.daytimeSupport ? s.daytimeSupportStartTime : null,
    daytime_support_end_time: s.daytimeSupport ? s.daytimeSupportEndTime : null,
  }
}
