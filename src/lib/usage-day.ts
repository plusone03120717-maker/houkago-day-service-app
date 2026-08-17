import type { createClient } from '@/lib/supabase/client'

type Client = ReturnType<typeof createClient>

type PlanRow = {
  id: string
  day_of_week: number[]
  start_date: string
  end_date: string | null
  transport_type: string
  pickup_location_type: string
  dropoff_location_type: string
}

/** 欠席にしたときにクリアする送迎・利用時間フィールド */
export const ABSENT_CLEARED_FIELDS = {
  pickup_departure_time: null,
  pickup_arrival_time: null,
  dropoff_departure_time: null,
  dropoff_arrival_time: null,
  service_start_time: null,
  service_end_time: null,
  check_in_time: null,
  check_out_time: null,
  daytime_support: false,
  daytime_support_start_time: null,
  daytime_support_end_time: null,
  daytime_pickup_departure_time: null,
  daytime_pickup_arrival_time: null,
  daytime_dropoff_departure_time: null,
  daytime_dropoff_arrival_time: null,
  daytime_pickup_driver_member_id: null,
  daytime_pickup_vehicle_id: null,
  daytime_dropoff_driver_member_id: null,
  daytime_dropoff_vehicle_id: null,
  pickup_driver_member_id: null,
  pickup_vehicle_id: null,
  dropoff_driver_member_id: null,
  dropoff_vehicle_id: null,
}

/** その日の送迎予定から外す */
async function removeFromTransport(supabase: Client, childId: string, unitId: string, date: string) {
  const { data: schedules } = await supabase
    .from('transport_schedules')
    .select('id')
    .eq('unit_id', unitId)
    .eq('date', date)
  if (schedules && schedules.length > 0) {
    await supabase
      .from('transport_details')
      .delete()
      .eq('child_id', childId)
      .in('schedule_id', schedules.map((s: { id: string }) => s.id))
  }
}

/**
 * その日を「欠席」として記録する。
 * 予約や利用計画には触らないので、出席管理には欠席として残り続け、
 * 国保連請求でも欠席時対応加算を算定できる。
 * （予定ごとなかったことにしたい場合は deleteUsageDay を使うこと）
 */
export async function markUsageDayAbsent(
  supabase: Client,
  { childId, unitId, date }: { childId: string; unitId: string; date: string }
): Promise<{ error?: string }> {
  const { data: existing } = await supabase
    .from('daily_attendance')
    .select('id')
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('daily_attendance')
      .update({ status: 'absent', ...ABSENT_CLEARED_FIELDS })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('daily_attendance').insert({
      child_id: childId,
      unit_id: unitId,
      date,
      status: 'absent',
      pickup_type: 'none',
      created_by: user?.id ?? null,
    })
    if (error) return { error: error.message }
  }

  await removeFromTransport(supabase, childId, unitId, date)
  return {}
}

/** 欠席を取り消して「未記録」に戻す（出席記録は消さない） */
export async function clearUsageDayAbsence(
  supabase: Client,
  { childId, unitId, date }: { childId: string; unitId: string; date: string }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('daily_attendance')
    .delete()
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
    .eq('status', 'absent')
  if (error) return { error: error.message }
  return {}
}

/**
 * 利用計画から自動生成される分を、その日だけキャンセル扱いにする。
 * これをやらないと、予約を消しても出席管理が利用計画から一覧を作り直すため
 * 同じ児童が翌読み込みで復活してしまう。
 */
async function cancelUsagePlanForDate(
  supabase: Client,
  childId: string,
  date: string
): Promise<string | undefined> {
  const { data: plans } = await supabase
    .from('usage_plans')
    .select('id, day_of_week, start_date, end_date, transport_type, pickup_location_type, dropoff_location_type')
    .eq('child_id', childId)
    .eq('is_active', true)
  if (!plans || plans.length === 0) return

  const dow = new Date(date + 'T00:00:00').getDay()
  for (const plan of plans as PlanRow[]) {
    if (!(plan.day_of_week ?? []).includes(dow)) continue
    if (date < plan.start_date) continue
    if (plan.end_date && date > plan.end_date) continue

    const { data: existing } = await supabase
      .from('usage_plan_date_overrides')
      .select('id')
      .eq('plan_id', plan.id)
      .eq('date', date)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('usage_plan_date_overrides')
        .update({ is_cancelled: true })
        .eq('id', existing.id)
      if (error) return error.message
    } else {
      const { error } = await supabase.from('usage_plan_date_overrides').insert({
        plan_id: plan.id,
        date,
        is_cancelled: true,
        transport_type: plan.transport_type,
        pickup_location_type: plan.pickup_location_type,
        dropoff_location_type: plan.dropoff_location_type,
      })
      if (error) return error.message
    }
  }
}

/**
 * 誤って入れた利用予定を「なかったこと」にする。
 * 「欠席」にするのではなく、その日の予定・出欠記録・送迎・請求上書きをまとめて消し、
 * 利用計画からの自動生成も止めて、出席管理の一覧から完全に消えるようにする。
 *
 * 出席管理・利用状況のどちらから消しても同じ結果になるよう、両画面から呼ぶこと。
 */
export async function deleteUsageDay(
  supabase: Client,
  { childId, unitId, date }: { childId: string; unitId: string; date: string }
): Promise<{ error?: string }> {
  // 請求側の上書きレコード
  await supabase
    .from('billing_daily_records')
    .delete()
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)

  // 出欠記録（支援記録・活動記録は ON DELETE CASCADE で一緒に消える）
  const { error: attError } = await supabase
    .from('daily_attendance')
    .delete()
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
  if (attError) return { error: attError.message }

  // 送迎予定
  await removeFromTransport(supabase, childId, unitId, date)

  // 利用計画からの自動生成を止める
  const planError = await cancelUsagePlanForDate(supabase, childId, date)
  if (planError) return { error: planError }

  // 利用予定そのもの
  // usage_reservations は (child_id, unit_id, date) が一意なので、
  // 予約IDを持っていない画面（利用計画由来の行）からでも確実に消せる
  const { error: resError } = await supabase
    .from('usage_reservations')
    .delete()
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
  if (resError) return { error: resError.message }

  return {}
}
