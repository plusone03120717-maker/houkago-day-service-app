'use server'

import { createClient } from '@/lib/supabase/server'
import { getStaffAccess } from '@/lib/require-admin'
import { canEditTransport, canEditUsagePlans } from '@/lib/roles'
import { isCancelMarkerOverride, pickPrimaryPlanPerChild } from '@/lib/schedule-defaults'
import { decidePickupLocation, type PickupLocationType } from '@/lib/pickup-location'
import { getTodayJST } from '@/lib/utils'
import type { PickupReviewItem, PickupSyncResult } from '@/lib/pickup-review'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** 読み取りに失敗したら、何も書きかえずに止める（指定なしと取り違えて上書きしないため） */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}の読み取りに失敗しました: ${res.error.message}`)
  return (res.data ?? []) as T
}

/** 人が選ぶ行。画面には PickupReviewItem として渡し、サーバーでは指定の元も持つ */
type ReviewRow = PickupReviewItem & {
  /** 「変える」を選んだら一緒に書きかえる、その日だけの指定 */
  overrideId?: string
  reservationId?: string
}

type PickupPlan = {
  /** 確認なしで新しい場所にそろえる行 */
  auto: { id: string; to: string }[]
  /** 変えるかどうかを人が選ぶ行 */
  review: ReviewRow[]
}

type PlanOptions = {
  /**
   * いつもの場所（計画・曜日別設定）を変えたか。特定日の上書きだけを直したときは false にして、
   * ほかの日の request / override / holiday を毎回たずねないようにする。
   */
  baseChanged: boolean
  /**
   * 変える前の場所。渡したときは、行が「前の場所のまま」のときだけ確認なしで変え、
   * それ以外（送迎管理で選び直した日など）は manual として人に選んでもらう。
   * 渡さないとき（全員の一括のそろえ直し）は、自宅・学校のままの行を確認なしでそろえる。
   */
  from?: PickupLocationType
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
 * 確認なしでそろえる（auto）: 設定から自動で入った場所のままで、今の設定と違う行
 * 人が選ぶ（review）:
 *   - manual   送迎管理で選んだ場所（祖父母宅など、または前の場所以外）。初めは「変える」
 *   - request  保護者の利用連絡でその日の場所が指定されている。初めは「変えない」
 *   - override 利用スケジュールの特定日の上書きで指定されている。初めは「変えない」
 *   - holiday  いつもの場所は学校だが土日・祝日。初めは「変えない」
 *
 * その日の場所の決め方は、送迎を作るときと同じ decidePickupLocation（@/lib/pickup-location）。
 */
async function planPickupRows(
  supabase: SupabaseServerClient,
  childId: string,
  options: PlanOptions
): Promise<PickupPlan> {
  const today = getTodayJST()
  const result: PickupPlan = { auto: [], review: [] }

  const [rowsRes, childRes] = await Promise.all([
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
  const rows = (must(rowsRes, '送迎の行') as unknown as Row[]).filter((r) => r.transport_schedules)
  if (childRes.error) throw new Error(`児童の読み取りに失敗しました: ${childRes.error.message}`)
  if (rows.length === 0 || !childRes.data) return result

  const child = childRes.data as unknown as { address: string | null; schools: { name: string } | null }
  const homeValue = child.address ?? null
  const schoolValue = child.schools?.name ?? null
  const dates = [...new Set(rows.map((r) => r.transport_schedules!.date))]

  type Plan = {
    id: string
    child_id: string
    unit_id: string
    day_of_week: number[] | null
    start_date: string
    end_date: string | null
    pickup_location_type: string | null
  }
  const plans = must(
    await supabase
      .from('usage_plans')
      .select('id, child_id, unit_id, day_of_week, start_date, end_date, pickup_location_type')
      .eq('child_id', childId)
      .eq('is_active', true),
    '利用スケジュール'
  ) as unknown as Plan[]
  const planIds = plans.map((p) => p.id)

  type DaySetting = { plan_id: string; day_of_week: number; pickup_location_type: string | null }
  type Override = {
    id: string
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
  type Reservation = {
    id: string
    unit_id: string
    date: string
    pickup_location_type: string | null
    pickup_address_id: string | null
  }
  const [daySettingsRes, overridesRes, reservationsRes] = await Promise.all([
    planIds.length > 0
      ? supabase
          .from('usage_plan_day_settings')
          .select('plan_id, day_of_week, pickup_location_type')
          .in('plan_id', planIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length > 0
      ? supabase
          .from('usage_plan_date_overrides')
          .select('id, plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
          .in('plan_id', planIds)
          .in('date', dates)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('usage_reservations')
      .select('id, unit_id, date, pickup_location_type, pickup_address_id')
      .eq('child_id', childId)
      .in('date', dates)
      .in('status', ['confirmed', 'reserved']),
  ])
  const daySettings = must(daySettingsRes, '曜日別設定') as unknown as DaySetting[]
  const overrides = must(overridesRes, '特定日の上書き') as unknown as Override[]
  const reservations = must(reservationsRes, '利用予定') as unknown as Reservation[]

  // その日だけ指定された登録住所（祖父母宅など）
  const addressIds = [...new Set(reservations.map((r) => r.pickup_address_id).filter((v): v is string => !!v))]
  const addressById = new Map<string, string>()
  if (addressIds.length > 0) {
    const addressRows = must(
      await supabase.from('child_addresses').select('id, address').in('id', addressIds),
      '登録住所'
    ) as { id: string; address: string }[]
    for (const a of addressRows) addressById.set(a.id, a.address)
  }

  const valueOf = (type: string | null, address: string | null = null) =>
    type === 'school' ? schoolValue : (address ?? homeValue)
  const fromValue = options.from ? valueOf(options.from) : null

  for (const row of rows) {
    const current = row.pickup_location
    const { date, unit_id: unitId } = row.transport_schedules!
    const dow = new Date(`${date}T00:00:00`).getDay()

    // 送迎を作るとき（transport.ts）と同じ材料を集める
    const unitPlans = plans.filter((p) => p.unit_id === unitId)
    const dayPlan = pickPrimaryPlanPerChild(unitPlans.filter((p) =>
      p.start_date <= date &&
      (p.end_date == null || p.end_date >= date) &&
      (p.day_of_week ?? []).includes(dow)
    ))[0]
    const override = dayPlan ? overrides.find((o) => o.plan_id === dayPlan.id && o.date === date) : undefined
    const cancelled = !!override?.is_cancelled
    const liveOverride = override && !cancelled && !isCancelMarkerOverride(override) ? override : undefined
    const reservation = reservations.find((r) => r.unit_id === unitId && r.date === date) ?? null
    const fallbackPlan = pickPrimaryPlanPerChild(unitPlans)[0]

    const decision = decidePickupLocation({
      date,
      dayPlanType: dayPlan && !cancelled ? dayPlan.pickup_location_type : undefined,
      cancelled,
      overrideType: liveOverride?.pickup_location_type,
      daySettingType: dayPlan
        ? daySettings.find((d) => d.plan_id === dayPlan.id && d.day_of_week === dow)?.pickup_location_type
        : null,
      reservation,
      fallbackPlanType: fallbackPlan?.pickup_location_type,
    })

    const requestAddress = reservation?.pickup_address_id
      ? addressById.get(reservation.pickup_address_id) ?? null
      : null
    const expected = valueOf(decision.type, decision.type === 'home' ? requestAddress : null)
    const baseValue = decision.baseType ? valueOf(decision.baseType) : null
    const isAutoValue = current == null || current === homeValue || current === schoolValue

    // 計画も場所の指定もない日（予約だけ・出席記録だけで、計画が見つからない日）は、
    // 決める材料がないので今の行をそのままにする（送迎管理で人が選んだ場所かもしれない）
    if (decision.source === 'none' && !requestAddress && current != null) continue

    // いつもの場所は学校だが学校が休みの日（土日・祝日）。
    // 学校のまま（人が選んだ・前からそう）なら戻さない。自宅なら、学校にするかは人が選ぶ
    if (decision.schoolOffAdjusted) {
      if (current === schoolValue) continue
      if (current === homeValue || current == null) {
        if (options.baseChanged && schoolValue) {
          result.review.push({ id: row.id, date, from: current, to: schoolValue, reason: 'holiday', recommended: false })
        }
        continue
      }
      // 祖父母宅などを選んである日は、下の manual と同じ扱い
    }

    if (expected && expected !== current) {
      const autoOk = options.from
        ? current == null || current === fromValue
        : isAutoValue
      if (autoOk) {
        result.auto.push({ id: row.id, to: expected })
      } else {
        // 送迎管理で選んだ場所（祖父母宅など、または前の場所以外を選び直した日）。
        // お迎え場所の変更の方が新しいので、初めは「変える」
        result.review.push({ id: row.id, date, from: current, to: expected, reason: 'manual', recommended: true })
      }
      continue
    }

    // その日だけの指定どおりになっているが、いつもの場所とは違う日。
    // 「変える」を選んだら、指定の方も新しい場所にする（次の同期で戻らないように）
    if (
      options.baseChanged &&
      (decision.source === 'request' || decision.source === 'override') &&
      decision.baseType &&
      baseValue &&
      baseValue !== current &&
      !(decision.baseType === 'school' && decision.schoolOffAdjusted)
    ) {
      result.review.push({
        id: row.id,
        date,
        from: current,
        to: baseValue,
        reason: decision.source,
        recommended: false,
        ...(decision.source === 'request' && reservation ? { reservationId: reservation.id } : {}),
        ...(decision.source === 'override' && liveOverride ? { overrideId: liveOverride.id } : {}),
      })
    }
  }

  result.review.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

/** 行の場所を書きかえる。同じ場所へ変える行はまとめて1回で送る */
async function applyRows(
  supabase: SupabaseServerClient,
  rows: { id: string; to: string }[]
): Promise<number> {
  const byTo = new Map<string, string[]>()
  for (const r of rows) {
    const ids = byTo.get(r.to) ?? []
    ids.push(r.id)
    byTo.set(r.to, ids)
  }
  let updated = 0
  for (const [to, ids] of byTo) {
    const { data, error } = await supabase
      .from('transport_details')
      .update({ pickup_location: to })
      .in('id', ids)
      .select('id')
    if (error) throw new Error(`送迎の行の書きかえに失敗しました: ${error.message}`)
    updated += (data ?? []).length
  }
  return updated
}

/** 画面に渡す形にする（サーバーで使う指定の元は渡さない） */
const toClient = (items: ReviewRow[]): PickupReviewItem[] =>
  items.map(({ id, date, from, to, reason, recommended }) => ({ id, date, from, to, reason, recommended }))

async function canSync(): Promise<boolean> {
  const access = await getStaffAccess()
  if (!access) return false
  return canEditUsagePlans(access.role, access.jobTitles) || canEditTransport(access.role, access.jobTitles)
}

const asLocation = (v: string | null | undefined): PickupLocationType | undefined =>
  v === 'home' || v === 'school' ? v : undefined

/**
 * 利用スケジュール（計画・曜日別設定・特定日の上書き）でお迎え場所を変えたあとに呼ぶ。
 * 確認の要らない行はそろえ、変えるかどうかを選ぶ行を返す。
 */
export async function refreshFuturePickupLocations(
  childId: string,
  options: { baseChanged?: boolean; from?: string | null } = {}
): Promise<PickupSyncResult> {
  if (!(await canSync())) return { updated: 0, review: [] }
  const supabase = await createClient()
  const plan = await planPickupRows(supabase, childId, {
    baseChanged: options.baseChanged ?? true,
    from: asLocation(options.from),
  })
  return { updated: await applyRows(supabase, plan.auto), review: toClient(plan.review) }
}

/**
 * 確認の一覧で「変える」を選んだ行だけを書きかえる。
 * 画面から来た id はそのまま信じず、今の状態で選べる行かを計算し直してから変える。
 * 保護者の利用連絡・特定日の上書きの日は、その指定も新しい場所にする
 * （行だけ変えると、次に同期したとき指定どおりに戻ってしまうため）。
 */
export async function applyPickupReview(childId: string, rowIds: string[]): Promise<{ updated: number }> {
  if (rowIds.length === 0 || !(await canSync())) return { updated: 0 }
  const supabase = await createClient()
  const plan = await planPickupRows(supabase, childId, { baseChanged: true })
  const chosen = new Set(rowIds)
  // 一覧を出したときは「前の場所」を渡していたので、今の計算では確認なし（auto）に入る行もある。
  // どちらに入っていても、選ばれた行だけを変える
  const picked: ReviewRow[] = [
    ...plan.review,
    ...plan.auto.map((a) => ({ ...a, date: '', from: null, reason: 'manual' as const, recommended: true })),
  ].filter((r) => chosen.has(r.id))

  const { data: childRow, error: childError } = await supabase
    .from('children')
    .select('schools(name)')
    .eq('id', childId)
    .maybeSingle()
  if (childError) throw new Error(`児童の読み取りに失敗しました: ${childError.message}`)
  const schoolValue = (childRow as unknown as { schools: { name: string } | null } | null)?.schools?.name ?? null
  const typeOf = (to: string): PickupLocationType => (to === schoolValue ? 'school' : 'home')

  for (const r of picked) {
    if (r.overrideId) {
      const { error } = await supabase
        .from('usage_plan_date_overrides')
        .update({ pickup_location_type: typeOf(r.to) })
        .eq('id', r.overrideId)
      if (error) throw new Error(`特定日の上書きの書きかえに失敗しました: ${error.message}`)
    }
    if (r.reservationId) {
      const { error } = await supabase
        .from('usage_reservations')
        .update({ pickup_location_type: typeOf(r.to), pickup_address_id: null })
        .eq('id', r.reservationId)
      if (error) throw new Error(`利用予定の書きかえに失敗しました: ${error.message}`)
    }
  }
  return { updated: await applyRows(supabase, picked) }
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
  from: PickupLocationType,
  to: PickupLocationType
): Promise<{ ok: boolean; plansUpdated: number } & PickupSyncResult> {
  const access = await getStaffAccess()
  if (!access || !canEditUsagePlans(access.role, access.jobTitles)) {
    return { ok: false, plansUpdated: 0, updated: 0, review: [] }
  }
  if (from === to) return { ok: true, plansUpdated: 0, updated: 0, review: [] }

  const supabase = await createClient()
  const today = getTodayJST()

  const planIds = (must(
    await supabase
      .from('usage_plans')
      .select('id')
      .eq('child_id', childId)
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${today}`),
    '利用スケジュール'
  ) as { id: string }[]).map((p) => p.id)

  let plansUpdated = 0
  if (planIds.length > 0) {
    const [plansRes, dayRes] = await Promise.all([
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
    if (plansRes.error) throw new Error(`利用スケジュールの書きかえに失敗しました: ${plansRes.error.message}`)
    if (dayRes.error) throw new Error(`曜日別設定の書きかえに失敗しました: ${dayRes.error.message}`)
    plansUpdated = (plansRes.data ?? []).length
  }

  const plan = await planPickupRows(supabase, childId, { baseChanged: true, from })
  return {
    ok: true,
    plansUpdated,
    updated: await applyRows(supabase, plan.auto),
    review: toClient(plan.review),
  }
}
