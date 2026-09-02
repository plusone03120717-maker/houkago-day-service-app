'use server'

import { createClient } from '@/lib/supabase/server'
import { buildRouteGroups, nearestNeighborSort, type RouteChildData } from '@/lib/transport-route'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type ChildRow = {
  id: string
  name: string
  postal_code: string | null
  address: string | null
  school_id: string | null
  schools: { id: string; name: string; latitude: number | null; longitude: number | null } | null
}

function getPickupLocation(c: RouteChildData, direction: 'pickup' | 'dropoff'): string | null {
  if (direction === 'pickup' && c.pickup_location_type === 'school') {
    return c.children?.schools?.name ?? null
  }
  return c.children?.address ?? null
}

/** 'HH:MM:SS' または 'HH:MM' を1時間単位のスロット文字列に丸める（例: '15:30' → '15:00:00'） */
function toHourSlot(timeStr: string | null): string | null {
  if (!timeStr) return null
  const hour = parseInt(timeStr.split(':')[0], 10)
  return `${String(hour).padStart(2, '0')}:00:00`
}

/** 既存スケジュールを削除して再生成 */
export async function deleteAndRecreateTransportSchedules(unitId: string, date: string) {
  const supabase = await createClient()
  await supabase
    .from('transport_schedules')
    .delete()
    .eq('unit_id', unitId)
    .eq('date', date)
  await autoCreateTransportSchedules(unitId, date)
}

export async function autoCreateTransportSchedules(unitId: string, date: string) {
  const supabase = await createClient()
  const todayDow = new Date(date).getDay()

  // 利用計画・個別予約・既存スケジュールは互いに独立しているため並列取得
  // （既存スケジュールは後段のループで insert 失敗→再select の往復を避けるため先読みする）
  const [{ data: plansRaw }, { data: reservationsRaw }, { data: existingSchedulesRaw }] = await Promise.all([
    // 利用計画から今日の対象児童を取得（送迎設定・時間も含む）
    supabase
      .from('usage_plans')
      .select('id, child_id, pickup_time, dropoff_time, transport_type, pickup_location_type, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .lte('start_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .contains('day_of_week', [todayDow]),
    // 個別予約からも取得（重複は後でマージ）
    supabase
      .from('usage_reservations')
      .select('child_id, pickup_time, dropoff_time, transport_type, pickup_location_type, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
      .eq('unit_id', unitId)
      .eq('date', date)
      .in('status', ['confirmed', 'reserved']),
    // 当日の既存スケジュール（明細の児童IDまで含めて1回で取得）
    supabase
      .from('transport_schedules')
      .select('id, direction, departure_time, transport_details(child_id)')
      .eq('unit_id', unitId)
      .eq('date', date),
  ])

  // 曜日別設定・特定日上書きを取得
  const planIds = (plansRaw ?? []).map((p) => p.id).filter(Boolean)
  const [{ data: daySettingsRaw }, { data: dateOverridesRaw }] = await Promise.all([
    planIds.length > 0
      ? supabase
          .from('usage_plan_day_settings')
          .select('plan_id, day_of_week, transport_type, pickup_location_type, pickup_time, dropoff_time')
          .in('plan_id', planIds)
          .eq('day_of_week', todayDow)
      : { data: [] },
    planIds.length > 0
      ? supabase
          .from('usage_plan_date_overrides')
          .select('plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time')
          .in('plan_id', planIds)
          .eq('date', date)
      : { data: [] },
  ])

  // plan_id → 曜日別設定のマップ
  const daySettingsMap = new Map<string, {
    transport_type: string
    pickup_location_type: string
    pickup_time: string | null
    dropoff_time: string | null
  }>()
  for (const ds of daySettingsRaw ?? []) {
    if (ds.plan_id) {
      daySettingsMap.set(ds.plan_id as string, {
        transport_type: ds.transport_type as string,
        pickup_location_type: ds.pickup_location_type as string,
        pickup_time: ds.pickup_time as string | null,
        dropoff_time: ds.dropoff_time as string | null,
      })
    }
  }

  // plan_id → 特定日上書きのマップ（最優先）
  const dateOverridesMap = new Map<string, {
    transport_type: string
    pickup_location_type: string
    pickup_time: string | null
    dropoff_time: string | null
  }>()
  for (const o of dateOverridesRaw ?? []) {
    if (o.plan_id) {
      dateOverridesMap.set(o.plan_id as string, {
        transport_type: o.transport_type as string,
        pickup_location_type: o.pickup_location_type as string,
        pickup_time: o.pickup_time as string | null,
        dropoff_time: o.dropoff_time as string | null,
      })
    }
  }

  // 児童をユニーク化（planが優先 → 曜日別設定 > plan全体設定の優先順）
  const childrenMap = new Map<string, ChildRow>()
  const pickupTimeMap = new Map<string, string | null>()
  const dropoffTimeMap = new Map<string, string | null>()
  // 便のグループ化には時単位スロット（pickupTimeMap）を使うが、
  // transport_details.pickup_time には丸めていない実際の時刻を保存する
  const rawPickupTimeMap = new Map<string, string | null>()
  const rawDropoffTimeMap = new Map<string, string | null>()
  const transportTypeMap = new Map<string, string>()
  const pickupLocationTypeMap = new Map<string, string>()

  for (const p of plansRaw ?? []) {
    if (p.child_id && !childrenMap.has(p.child_id)) {
      // 優先順位: 特定日上書き > 曜日別設定 > プランのデフォルト
      const dateOverride = dateOverridesMap.get(p.id as string)
      const daySetting = dateOverride ? null : daySettingsMap.get(p.id as string)
      const override = dateOverride ?? daySetting
      childrenMap.set(p.child_id, p.children as unknown as ChildRow)
      pickupTimeMap.set(p.child_id, toHourSlot((override?.pickup_time ?? p.pickup_time) as string | null))
      dropoffTimeMap.set(p.child_id, toHourSlot((override?.dropoff_time ?? p.dropoff_time) as string | null))
      rawPickupTimeMap.set(p.child_id, (override?.pickup_time ?? p.pickup_time) as string | null)
      rawDropoffTimeMap.set(p.child_id, (override?.dropoff_time ?? p.dropoff_time) as string | null)
      transportTypeMap.set(p.child_id, (override?.transport_type ?? p.transport_type ?? 'both') as string)
      pickupLocationTypeMap.set(p.child_id, (override?.pickup_location_type ?? p.pickup_location_type ?? 'home') as string)
    }
  }
  for (const r of reservationsRaw ?? []) {
    if (!r.child_id) continue
    const rPickupTime = r.pickup_time as string | null
    const rDropoffTime = r.dropoff_time as string | null
    if (!childrenMap.has(r.child_id)) {
      // 予約のみの児童（プランに存在しない）
      childrenMap.set(r.child_id, r.children as unknown as ChildRow)
      pickupTimeMap.set(r.child_id, toHourSlot(rPickupTime))
      dropoffTimeMap.set(r.child_id, toHourSlot(rDropoffTime))
      rawPickupTimeMap.set(r.child_id, rPickupTime)
      rawDropoffTimeMap.set(r.child_id, rDropoffTime)
      transportTypeMap.set(r.child_id, (r.transport_type ?? 'both') as string)
      pickupLocationTypeMap.set(r.child_id, (r.pickup_location_type ?? 'home') as string)
    } else {
      // プランに存在する児童: 予約のtransport_typeと時間で補完・上書き
      // transport_typeが予約で明示されている場合はプランの設定より優先（当日のみ有効）
      const rTransportType = r.transport_type as string | null
      if (rTransportType && rTransportType !== transportTypeMap.get(r.child_id)) {
        transportTypeMap.set(r.child_id, rTransportType)
      }
      if (r.pickup_location_type) {
        pickupLocationTypeMap.set(r.child_id, r.pickup_location_type as string)
      }
      if (pickupTimeMap.get(r.child_id) === null && rPickupTime) {
        pickupTimeMap.set(r.child_id, toHourSlot(rPickupTime))
        rawPickupTimeMap.set(r.child_id, rPickupTime)
      }
      if (dropoffTimeMap.get(r.child_id) === null && rDropoffTime) {
        dropoffTimeMap.set(r.child_id, toHourSlot(rDropoffTime))
        rawDropoffTimeMap.set(r.child_id, rDropoffTime)
      }
    }
  }

  if (childrenMap.size === 0) return

  // 時間がまだnullの児童に対して、同ユニット内の曜日不問の計画から時間を補完
  // （transport_type='none'の児童は送迎不要のためスキップ）
  const nullTimeChildIds = [...childrenMap.keys()].filter((id) => {
    const type = transportTypeMap.get(id) ?? 'both'
    if (type === 'none') return false
    const needPickup = type === 'both' || type === 'pickup_only'
    const needDropoff = type === 'both' || type === 'dropoff_only'
    return (needPickup && pickupTimeMap.get(id) === null) ||
           (needDropoff && dropoffTimeMap.get(id) === null)
  })
  if (nullTimeChildIds.length > 0) {
    // まず同ユニットのプラン（曜日・日付不問）から時間を補完
    // 次にユニットを問わず検索（プランが別ユニットに存在する場合のフォールバック）
    // さらに usage_plan_day_settings も検索して時間を補完
    const broaderPickup = new Map<string, string>()
    const broaderDropoff = new Map<string, string>()

    const fillFromPlans = (plans: Array<{ child_id: unknown; pickup_time: unknown; dropoff_time: unknown }>) => {
      for (const bp of plans) {
        if (!bp.child_id) continue
        const id = bp.child_id as string
        if (!broaderPickup.has(id) && bp.pickup_time) broaderPickup.set(id, bp.pickup_time as string)
        if (!broaderDropoff.has(id) && bp.dropoff_time) broaderDropoff.set(id, bp.dropoff_time as string)
      }
    }

    // Step1: 同ユニットの有効なプラン（曜日不問）から時間を補完
    const { data: sameUnitPlans } = await supabase
      .from('usage_plans')
      .select('child_id, pickup_time, dropoff_time')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .in('child_id', nullTimeChildIds)
      .not('pickup_time', 'is', null)
    fillFromPlans(sameUnitPlans ?? [])

    // Step2: 同ユニットの usage_plan_day_settings から時間補完（plan.pickup_time が null の場合）
    const stillNullAfterStep1 = nullTimeChildIds.filter(
      (id) => !broaderPickup.has(id) && !broaderDropoff.has(id)
    )
    if (stillNullAfterStep1.length > 0) {
      const { data: sameUnitPlanIds } = await supabase
        .from('usage_plans')
        .select('id, child_id')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .in('child_id', stillNullAfterStep1)
      const relevantPlanIds = (sameUnitPlanIds ?? []).map((p) => p.id as string).filter(Boolean)
      if (relevantPlanIds.length > 0) {
        const { data: daySettingsTimes } = await supabase
          .from('usage_plan_day_settings')
          .select('plan_id, pickup_time, dropoff_time')
          .in('plan_id', relevantPlanIds)
          .not('pickup_time', 'is', null)
        const planToChild = new Map((sameUnitPlanIds ?? []).map((p) => [p.id as string, p.child_id as string]))
        fillFromPlans((daySettingsTimes ?? []).map((ds) => ({
          child_id: planToChild.get(ds.plan_id as string) ?? null,
          pickup_time: ds.pickup_time,
          dropoff_time: ds.dropoff_time,
        })))
      }
    }

    // Step3: 他ユニットのプラン（同ユニットに時間情報がない場合の最終フォールバック）
    const stillNullAfterStep2 = nullTimeChildIds.filter(
      (id) => !broaderPickup.has(id) && !broaderDropoff.has(id)
    )
    if (stillNullAfterStep2.length > 0) {
      const { data: otherUnitPlans } = await supabase
        .from('usage_plans')
        .select('child_id, pickup_time, dropoff_time')
        .eq('is_active', true)
        .in('child_id', stillNullAfterStep2)
        .not('pickup_time', 'is', null)
      fillFromPlans(otherUnitPlans ?? [])
    }

    for (const id of nullTimeChildIds) {
      if (pickupTimeMap.get(id) === null && broaderPickup.has(id)) {
        pickupTimeMap.set(id, toHourSlot(broaderPickup.get(id)!))
        rawPickupTimeMap.set(id, broaderPickup.get(id)!)
      }
      if (dropoffTimeMap.get(id) === null && broaderDropoff.has(id)) {
        dropoffTimeMap.set(id, toHourSlot(broaderDropoff.get(id)!))
        rawDropoffTimeMap.set(id, broaderDropoff.get(id)!)
      }
    }
  }

  // 送迎設定に基づいて候補を時間スロットごとにグループ化
  const pickupSlots = new Map<string | null, RouteChildData[]>()
  const dropoffSlots = new Map<string | null, RouteChildData[]>()

  for (const [childId, childData] of childrenMap) {
    const transportType = transportTypeMap.get(childId) ?? 'both'
    if (transportType === 'none') continue

    const routeChild: RouteChildData = {
      child_id: childId,
      children: {
        id: childData?.id ?? childId,
        name: childData?.name ?? '',
        postal_code: childData?.postal_code ?? null,
        address: childData?.address ?? null,
        school_id: childData?.school_id ?? null,
        schools: childData?.schools ?? null,
      },
      pickup_location_type: (pickupLocationTypeMap.get(childId) ?? 'home') as 'home' | 'school',
    }

    if (transportType === 'both' || transportType === 'pickup_only') {
      const slot = pickupTimeMap.get(childId) ?? null
      if (!pickupSlots.has(slot)) pickupSlots.set(slot, [])
      pickupSlots.get(slot)!.push(routeChild)
    }
    if (transportType === 'both' || transportType === 'dropoff_only') {
      const slot = dropoffTimeMap.get(childId) ?? null
      if (!dropoffSlots.has(slot)) dropoffSlots.set(slot, [])
      dropoffSlots.get(slot)!.push(routeChild)
    }
  }

  // ── スケジュール作成 ──
  // 既存スケジュールは冒頭で1回だけ取得済み。
  // 以前は「insert して 23505 で失敗したら select し直す」を時間スロットごとに
  // 直列で繰り返していたため、既に生成済みの日でも往復が十数回発生していた。
  type ExistingSchedule = {
    id: string
    direction: string
    departure_time: string | null
    transport_details: { child_id: string }[]
  }
  // unit_id + date + direction にユニーク制約があるため方向ごとに最大1件
  const scheduleByDirection = new Map<string, ExistingSchedule>()
  for (const s of (existingSchedulesRaw ?? []) as unknown as ExistingSchedule[]) {
    if (scheduleByDirection.has(s.direction)) continue
    scheduleByDirection.set(s.direction, { ...s, transport_details: s.transport_details ?? [] })
  }

  /** TIME 型は 'HH:MM:SS' で返るが 'HH:MM' の可能性もあるため先頭5文字で比較 */
  const sameSlot = (a: string | null, b: string | null) =>
    (a ?? '').slice(0, 5) === (b ?? '').slice(0, 5)

  for (const direction of ['pickup', 'dropoff'] as const) {
    const slotsMap = direction === 'pickup' ? pickupSlots : dropoffSlots

    for (const [slot, candidates] of slotsMap) {
      if (candidates.length === 0) continue
      // 時間が不明な児童は自動スケジュールを作成しない（手動で割り当てる）
      if (slot === null) continue

      const groups = nearestNeighborSort(buildRouteGroups(candidates, direction))
      const orderedChildren = groups.flatMap((g) => g.children)

      let existing = scheduleByDirection.get(direction)

      if (!existing) {
        const { data: schedule, error: schedErr } = await supabase
          .from('transport_schedules')
          .insert({
            unit_id: unitId,
            date,
            direction,
            vehicle_id: null,
            departure_time: slot,
            route_order: [],
          })
          .select('id')
          .single()

        if (schedErr || !schedule) {
          // 同時実行で既に作られていた場合のみ取得し直す
          if (schedErr?.code !== '23505') continue
          const { data: refetched } = await supabase
            .from('transport_schedules')
            .select('id, direction, departure_time, transport_details(child_id)')
            .eq('unit_id', unitId)
            .eq('date', date)
            .eq('direction', direction)
            .maybeSingle()
          if (!refetched) continue
          const r = refetched as unknown as ExistingSchedule
          existing = { ...r, transport_details: r.transport_details ?? [] }
        } else {
          existing = { id: schedule.id, direction, departure_time: slot, transport_details: [] }
        }
        scheduleByDirection.set(direction, existing)
      }

      const sched = existing
      // 既存スケジュールの出発時刻が違うスロットは対象外（従来どおり何もしない）
      if (!sameSlot(sched.departure_time, slot)) continue

      const existingIds = new Set(sched.transport_details.map((d) => d.child_id))
      const missing = orderedChildren.filter((c) => !existingIds.has(c.child_id))
      if (missing.length === 0) continue

      const nextOrder = sched.transport_details.length
      const rawTimeMap = direction === 'pickup' ? rawPickupTimeMap : rawDropoffTimeMap
      await supabase.from('transport_details').insert(
        missing.map((c, idx) => ({
          schedule_id: sched.id,
          child_id: c.child_id,
          pickup_location: getPickupLocation(c, direction),
          pickup_time: rawTimeMap.get(c.child_id) ?? slot,
          status: 'scheduled',
          sort_order: nextOrder + idx,
        }))
      )
      sched.transport_details.push(...missing.map((c) => ({ child_id: c.child_id })))
    }
  }
}

// =====================================================
// 送迎管理 → 日々の記録（daily_attendance）への一方向同期
//
// 送迎管理で組んだ配車を、スタッフスケジュール・LINE・国保連請求が読む
// daily_attendance 側にも反映する。日々の記録側での編集は送迎管理には
// 戻さない（同期は送迎管理→日々の記録の一方向のみ）。
// =====================================================

/** 'HH:MM' を分単位でずらす。日をまたぐ場合は null */
function shiftTime(hhmm: string, minutes: number): string | null {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const total = h * 60 + m + minutes
  if (total < 0 || total >= 24 * 60) return null
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const hasTime = (v: string | null | undefined) => !!v && v !== '00:00' && v !== '00:00:00'

/** daily_attendance のうち送迎・日中一時パネルが扱う列 */
type AttendanceRow = {
  id: string
  status: string
  pickup_type: string
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  service_start_time: string | null
  daytime_support: boolean | null
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

const ATTENDANCE_SELECT =
  'id, status, pickup_type, pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id, ' +
  'dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id, ' +
  'service_start_time, daytime_support, daytime_support_start_time, daytime_support_end_time'

/**
 * 送迎・日中一時パネルが「まだ何も入力されていない」と判定する状態か。
 * この状態の行は各画面で利用スケジュールの初期値が表示されるだけで、
 * DB には値が入っていない。送迎管理から1項目でも書き込むと初期値の
 * 表示が止まってしまうため、そのときは初期値ごと確定させる。
 */
function isBlankAttendance(a: AttendanceRow | null): boolean {
  if (!a) return true
  return !(
    hasTime(a.pickup_departure_time) || hasTime(a.pickup_arrival_time) ||
    a.pickup_driver_member_id || a.pickup_vehicle_id ||
    hasTime(a.dropoff_departure_time) || hasTime(a.dropoff_arrival_time) ||
    a.dropoff_driver_member_id || a.dropoff_vehicle_id ||
    hasTime(a.service_start_time) || a.daytime_support ||
    hasTime(a.daytime_support_start_time) || hasTime(a.daytime_support_end_time)
  )
}

type PlanTimeKey = 'pickup_time' | 'dropoff_time' | 'service_start_time' | 'service_end_time'

/** その日の利用スケジュール（特定日上書き > 曜日別設定 > プラン）から利用時間・日中一時を解決 */
async function resolveScheduleDefaults(
  supabase: SupabaseServerClient,
  childId: string,
  unitId: string,
  date: string
): Promise<Record<string, unknown>> {
  const dow = new Date(date).getDay()
  const { data: plans } = await supabase
    .from('usage_plans')
    .select('id, pickup_time, dropoff_time, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time')
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .contains('day_of_week', [dow])
    .limit(1)

  const plan = plans?.[0]
  if (!plan) return {}

  const [{ data: daySetting }, { data: override }] = await Promise.all([
    supabase
      .from('usage_plan_day_settings')
      .select('pickup_time, dropoff_time, service_start_time, service_end_time')
      .eq('plan_id', plan.id)
      .eq('day_of_week', dow)
      .maybeSingle(),
    supabase
      .from('usage_plan_date_overrides')
      .select('pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
      .eq('plan_id', plan.id)
      .eq('date', date)
      .maybeSingle(),
  ])

  const ov = (override?.is_cancelled ? null : override) as Record<string, unknown> | null
  const ds = daySetting as Record<string, unknown> | null
  const pl = plan as unknown as Record<string, unknown>
  const pick = (key: PlanTimeKey) =>
    (ov?.[key] ?? ds?.[key] ?? pl[key] ?? null) as string | null

  // 利用開始が未設定ならお迎え時刻を充てる（送迎・日中一時パネルと同じ規則）
  const start = pick('service_start_time') ?? pick('pickup_time')
  const end = pick('service_end_time')
  const daytime = (pl.daytime_support as boolean | null) ?? false

  return {
    service_start_time: start,
    check_in_time: start,
    service_end_time: end,
    check_out_time: end,
    daytime_support: daytime,
    daytime_support_start_time: daytime ? pl.daytime_support_start_time : null,
    daytime_support_end_time: daytime ? pl.daytime_support_end_time : null,
  }
}

type SyncInput = {
  childId: string
  unitId: string
  date: string
  direction: 'pickup' | 'dropoff'
  /** 'HH:MM' / null（クリア）。undefined なら時刻は触らない */
  time?: string | null
  driverMemberId?: string | null
  vehicleId?: string | null
}

/**
 * 送迎管理での編集内容を daily_attendance に反映する。
 * お迎えの時刻は「到着時刻」、お送りの時刻は「施設の出発時刻」に対応させ、
 * 対になる時刻（お迎えの出発／お送りの到着）は空のときだけ ±10 分で補完する。
 */
export async function syncTransportToAttendance(input: SyncInput) {
  const { childId, unitId, date, direction, time, driverMemberId, vehicleId } = input
  const supabase = await createClient()

  const { data: existingRaw } = await supabase
    .from('daily_attendance')
    .select(ATTENDANCE_SELECT)
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
    .maybeSingle()
  const existing = (existingRaw ?? null) as AttendanceRow | null

  // 欠席として記録済みの日は送迎管理からの書き込みで復活させない
  if (existing?.status === 'absent') return

  const patch: Record<string, unknown> = {}

  if (direction === 'pickup') {
    if (driverMemberId !== undefined) patch.pickup_driver_member_id = driverMemberId
    if (vehicleId !== undefined) patch.pickup_vehicle_id = vehicleId
    if (time !== undefined) {
      patch.pickup_arrival_time = time
      // 施設を出るのは到着の10分前
      if (time && !hasTime(existing?.pickup_departure_time)) {
        patch.pickup_departure_time = shiftTime(time, -10)
      }
    }
  } else {
    if (driverMemberId !== undefined) patch.dropoff_driver_member_id = driverMemberId
    if (vehicleId !== undefined) patch.dropoff_vehicle_id = vehicleId
    if (time !== undefined) {
      patch.dropoff_departure_time = time
      // 自宅に着くのは出発の10分後
      if (time && !hasTime(existing?.dropoff_arrival_time)) {
        patch.dropoff_arrival_time = shiftTime(time, 10)
      }
    }
  }

  if (Object.keys(patch).length === 0) return

  // この方向の送迎があることを送迎区分にも反映する（既存の区分は広げるだけ）
  if (existing) {
    const current = existing.pickup_type
    const own = direction === 'pickup' ? 'pickup_only' : 'dropoff_only'
    const other = direction === 'pickup' ? 'dropoff_only' : 'pickup_only'
    const next = current === 'both' || current === other ? 'both' : own
    if (next !== current) patch.pickup_type = next
  }

  // 未入力の行に書き込むときは、各画面が表示していた利用スケジュールの
  // 初期値（利用時間・日中一時）も一緒に確定させる
  const defaults = isBlankAttendance(existing)
    ? await resolveScheduleDefaults(supabase, childId, unitId, date)
    : {}

  if (existing) {
    await supabase
      .from('daily_attendance')
      .update({ ...defaults, ...patch })
      .eq('id', existing.id)
  } else {
    await supabase.from('daily_attendance').insert({
      child_id: childId,
      unit_id: unitId,
      date,
      status: 'attended',
      pickup_type: direction === 'pickup' ? 'pickup_only' : 'dropoff_only',
      ...defaults,
      ...patch,
    })
  }
}

/**
 * 送迎管理から1方向を取り下げたときの後始末。
 * daily_attendance のその方向の送迎欄を消し、送迎区分も狭める。
 */
export async function clearTransportDirection(
  childId: string,
  unitId: string,
  date: string,
  direction: 'pickup' | 'dropoff'
) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('daily_attendance')
    .select('id, pickup_type')
    .eq('child_id', childId)
    .eq('unit_id', unitId)
    .eq('date', date)
    .maybeSingle()
  if (!existing) return

  const current = existing.pickup_type as string
  const nextPickupType =
    direction === 'pickup'
      ? current === 'both' ? 'dropoff_only' : current === 'pickup_only' ? 'none' : current
      : current === 'both' ? 'pickup_only' : current === 'dropoff_only' ? 'none' : current

  const cleared =
    direction === 'pickup'
      ? {
          pickup_departure_time: null,
          pickup_arrival_time: null,
          pickup_driver_member_id: null,
          pickup_vehicle_id: null,
        }
      : {
          dropoff_departure_time: null,
          dropoff_arrival_time: null,
          dropoff_driver_member_id: null,
          dropoff_vehicle_id: null,
        }

  await supabase
    .from('daily_attendance')
    .update({ ...cleared, pickup_type: nextPickupType })
    .eq('id', existing.id)
}
