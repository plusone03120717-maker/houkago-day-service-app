import { createClient } from '@/lib/supabase/server'
import { formatDate, getTodayJST } from '@/lib/utils'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import type { Unit, Reservation, Attendance, PrevAttendanceRow } from '@/components/attendance/attendance-board'
import type { ScheduleDefaults } from '@/components/transport/transport-daytime-panel'

const TRANSPORT_COLUMNS = `
  basic_service,
  service_start_time, service_end_time, check_in_time, check_out_time,
  daytime_support, daytime_support_start_time, daytime_support_end_time,
  pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
  dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
  daytime_pickup_departure_time, daytime_pickup_arrival_time, daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
  daytime_dropoff_departure_time, daytime_dropoff_arrival_time, daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id
`

/** 送迎・時間系の入力が一つでも入っている行か */
function hasAnyTransportInput(r: PrevAttendanceRow): boolean {
  const t = (v: string | null) => !!v && v.slice(0, 5) !== '00:00'
  return (
    t(r.service_start_time) || t(r.pickup_departure_time) || t(r.pickup_arrival_time) ||
    t(r.dropoff_departure_time) || t(r.dropoff_arrival_time) ||
    !!r.pickup_driver_member_id || !!r.dropoff_driver_member_id ||
    r.daytime_support
  )
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? getTodayJST()
  const todayDow = new Date(today).getDay()

  // 認証ユーザーとユニット一覧は独立しているため並列取得
  const [
    { data: { user } },
    { data: unitsRaw },
    { data: staffMembersRaw },
    { data: vehiclesRaw },
    { data: facilityRaw },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('units')
      .select('id, name, service_type, capacity, facilities (id, name)')
      .order('name'),
    supabase.from('staff_members').select('id, name').order('name'),
    supabase.from('transport_vehicles').select('id, name').order('name'),
    supabase.from('facilities').select('id').limit(1).single(),
  ])
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const { data: notifSettings } = facilityRaw
    ? await supabase
        .from('notification_settings')
        .select('default_service_end_time')
        .eq('facility_id', facilityRaw.id)
        .limit(1)
        .single()
    : { data: null }
  const defaultServiceEndTime = (notifSettings?.default_service_end_time as string | null)?.slice(0, 5) ?? '16:30'

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const [{ data: reservationsRaw }, { data: plansRaw }, { data: attendancesRaw }] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('usage_reservations')
          .select('id, child_id, date, status, requested_by, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
          .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
      : { data: [] },

    // 有効な利用計画を取得（日付・曜日フィルタはJSで行う）
    selectedUnitId
      ? supabase
          .from('usage_plans')
          .select('id, child_id, start_date, end_date, day_of_week, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
      : { data: [] },

    // daily_attendance を全件取得（予約・計画の有無に関わらず）
    selectedUnitId
      ? supabase
          .from('daily_attendance')
          .select('*')
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
      : { data: [] },
  ])
  const attendances = (attendancesRaw ?? []) as unknown as Attendance[]

  type PlanRow = {
    id: string
    child_id: string
    start_date: string
    end_date: string | null
    day_of_week: number[]
    transport_type: string
    pickup_time: string | null
    dropoff_time: string | null
    service_start_time: string | null
    service_end_time: string | null
    daytime_support: boolean
    daytime_support_start_time: string | null
    daytime_support_end_time: string | null
    children: Reservation['children']
  }
  const planRows = ((plansRaw ?? []) as unknown as PlanRow[]).filter((p) => {
    if (p.start_date > today) return false
    if (p.end_date !== null && p.end_date < today) return false
    return (p.day_of_week ?? []).includes(todayDow)
  })

  // この日付でキャンセルされた計画IDを取得
  const planIds = planRows.map((p) => p.id)
  const { data: cancelledOverridesRaw } = planIds.length > 0
    ? await supabase
        .from('usage_plan_date_overrides')
        .select('plan_id')
        .in('plan_id', planIds)
        .eq('date', today)
        .eq('is_cancelled', true)
    : { data: [] }
  const cancelledPlanIds = new Set((cancelledOverridesRaw ?? []).map((o: { plan_id: string }) => o.plan_id))

  // 計画があるが全てキャンセルされている児童を特定
  const childHasPlan = new Set<string>(planRows.map((p) => p.child_id))
  const childHasValidPlan = new Set<string>(
    planRows.filter((p) => !cancelledPlanIds.has(p.id)).map((p) => p.child_id)
  )

  // ── 送迎・日中一時入力の初期値: 特定日上書き > 曜日別設定 > プランのデフォルト ──
  type DaySettingRow = {
    plan_id: string
    transport_type: string | null
    pickup_time: string | null
    dropoff_time: string | null
    service_start_time: string | null
    service_end_time: string | null
  }
  type DateOverrideRow = DaySettingRow & { date: string; is_cancelled: boolean }

  const [{ data: daySettingsRaw }, { data: overridesRaw }] = planIds.length > 0
    ? await Promise.all([
        supabase
          .from('usage_plan_day_settings')
          .select('plan_id, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time')
          .in('plan_id', planIds)
          .eq('day_of_week', todayDow),
        supabase
          .from('usage_plan_date_overrides')
          .select('plan_id, date, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
          .in('plan_id', planIds)
          .eq('date', today),
      ])
    : [{ data: [] }, { data: [] }]

  const daySettingByPlanId = Object.fromEntries(
    ((daySettingsRaw ?? []) as unknown as DaySettingRow[]).map((d) => [d.plan_id, d])
  )
  const overrideByPlanId = Object.fromEntries(
    ((overridesRaw ?? []) as unknown as DateOverrideRow[])
      .filter((o) => !o.is_cancelled)
      .map((o) => [o.plan_id, o])
  )

  const scheduleDefaultsByChildId: Record<string, ScheduleDefaults> = {}
  for (const plan of planRows) {
    if (cancelledPlanIds.has(plan.id) || scheduleDefaultsByChildId[plan.child_id]) continue
    const ov = overrideByPlanId[plan.id]
    const ds = daySettingByPlanId[plan.id]
    scheduleDefaultsByChildId[plan.child_id] = {
      transportType: ov?.transport_type ?? ds?.transport_type ?? plan.transport_type,
      pickupTime: ov?.pickup_time ?? ds?.pickup_time ?? plan.pickup_time,
      dropoffTime: ov?.dropoff_time ?? ds?.dropoff_time ?? plan.dropoff_time,
      serviceStartTime: ov?.service_start_time ?? ds?.service_start_time ?? plan.service_start_time,
      serviceEndTime: ov?.service_end_time ?? ds?.service_end_time ?? plan.service_end_time,
      daytimeSupport: plan.daytime_support ?? false,
      daytimeSupportStartTime: plan.daytime_support_start_time,
      daytimeSupportEndTime: plan.daytime_support_end_time,
    }
  }

  // 予約フィルタリング:
  // - 有効な計画あり → 常に表示
  // - 計画あるが当日がキャンセルoverride → 手動予約（requested_by!=null）のみ表示
  // - 計画なし（削除・曜日変更・終了日変更済み）→ 手動予約のみ表示
  //   ※自動生成予約（requested_by=null）は計画がなければ除外することで同期ズレを防ぐ
  type ReservationWithMeta = Reservation & { requested_by: string | null }
  const reservations = ((reservationsRaw ?? []) as unknown as ReservationWithMeta[]).filter((r) => {
    if (childHasValidPlan.has(r.child_id)) return true
    return r.requested_by != null
  }) as unknown as Reservation[]

  // 予約に含まれていない利用計画の児童をマージ（キャンセル済みは除外）
  const reservedChildIds = new Set(reservations.map((r) => r.child_id))
  const planReservations: Reservation[] = planRows
    .filter((p) => !reservedChildIds.has(p.child_id) && !cancelledPlanIds.has(p.id))
    .map((p) => ({
      id: p.id,
      child_id: p.child_id,
      date: today,
      status: 'plan',
      children: p.children,
    }))
  const allReservations = [...reservations, ...planReservations]

  // daily_attendance に記録があるが allReservations に含まれない子ども（子ども管理から直接登録）を追加
  const existingChildIds = new Set(allReservations.map((r) => r.child_id))
  const extraChildIds = attendances
    .map((a) => a.child_id)
    .filter((id) => !existingChildIds.has(id))

  let finalReservations: Reservation[] = allReservations
  if (extraChildIds.length > 0) {
    const { data: extraChildrenRaw } = await supabase
      .from('children')
      .select('id, name, name_kana, photo_url, allergy_info, medical_info')
      .in('id', extraChildIds)
    type ChildInfo = { id: string; name: string; name_kana: string | null; photo_url: string | null; allergy_info: string | null; medical_info: string | null }
    const extraReservations: Reservation[] = ((extraChildrenRaw ?? []) as unknown as ChildInfo[]).map((child) => ({
      id: `da-${child.id}`,
      child_id: child.id,
      date: today,
      status: 'scheduled',
      children: child,
    }))
    finalReservations = [...allReservations, ...extraReservations]
  }

  // ── 前回コピー用: 過去45日以内の直近の出席データ（児童ごとに入力のある最新行） ──
  const childIds = [...new Set(finalReservations.map((r) => r.child_id))]
  const rangeStart = new Date(today)
  rangeStart.setDate(rangeStart.getDate() - 45)
  const prevRangeStart = rangeStart.toISOString().slice(0, 10)

  const { data: prevRaw } = childIds.length > 0
    ? await supabase
        .from('daily_attendance')
        .select(`child_id, date, ${TRANSPORT_COLUMNS}`)
        .in('child_id', childIds)
        .eq('status', 'attended')
        .gte('date', prevRangeStart)
        .lt('date', today)
        .order('date', { ascending: false })
    : { data: [] }

  const prevByChildId: Record<string, PrevAttendanceRow> = {}
  for (const row of (prevRaw ?? []) as unknown as PrevAttendanceRow[]) {
    if (!prevByChildId[row.child_id] && hasAnyTransportInput(row)) {
      prevByChildId[row.child_id] = row
    }
  }

  return (
    <AttendanceBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      reservations={finalReservations}
      attendances={attendances}
      staffId={user?.id ?? ''}
      staffMembers={(staffMembersRaw ?? []) as { id: string; name: string }[]}
      vehicles={(vehiclesRaw ?? []) as { id: string; name: string }[]}
      defaultServiceEndTime={defaultServiceEndTime}
      prevByChildId={prevByChildId}
      scheduleDefaultsByChildId={scheduleDefaultsByChildId}
    />
  )
}
