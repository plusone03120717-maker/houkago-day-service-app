import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { RecordsListBoard } from '@/components/records/records-list-board'

type AttendedChild = {
  id: string
  child_id: string
  unit_id: string
  status: string
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  check_in_time: string | null
  check_out_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

type DailyRecord = {
  id: string
  attendance_id: string
  has_notable_flag: boolean
}

type PrevAttendanceRow = {
  child_id: string
  date: string
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  check_in_time: string | null
  check_out_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
}

type UsagePlanRow = {
  id: string
  child_id: string
  unit_id: string
  day_of_week: number[] | null
  start_date: string
  end_date: string | null
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  transport_type: string
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

type DaySettingRow = {
  plan_id: string
  day_of_week: number
  transport_type: string | null
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
}

type DateOverrideRow = {
  plan_id: string
  date: string
  transport_type: string | null
  pickup_time: string | null
  dropoff_time: string | null
  service_start_time: string | null
  service_end_time: string | null
  is_cancelled: boolean
}

type ScheduleDefaults = {
  transportType: string
  pickupTime: string | null
  dropoffTime: string | null
  serviceStartTime: string | null
  serviceEndTime: string | null
  daytimeSupport: boolean
  daytimeSupportStartTime: string | null
  daytimeSupportEndTime: string | null
}

const TRANSPORT_COLUMNS = `
  basic_service,
  service_start_time, service_end_time, check_in_time, check_out_time,
  daytime_support, daytime_support_start_time, daytime_support_end_time,
  pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
  dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
  daytime_pickup_departure_time, daytime_pickup_arrival_time, daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
  daytime_dropoff_departure_time, daytime_dropoff_arrival_time, daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id
`

// 送迎・時間系の入力が一つでも入っている行か
function hasAnyTransportInput(r: PrevAttendanceRow): boolean {
  const t = (v: string | null) => !!v && v.slice(0, 5) !== '00:00'
  return (
    t(r.service_start_time) || t(r.pickup_departure_time) || t(r.pickup_arrival_time) ||
    t(r.dropoff_departure_time) || t(r.dropoff_arrival_time) ||
    !!r.pickup_driver_member_id || !!r.dropoff_driver_member_id ||
    r.daytime_support
  )
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const targetDate = params.date ?? getTodayJST()

  const [
    { data: attendedRaw },
    { data: staffMembersRaw },
    { data: vehiclesRaw },
    { data: facilityRaw },
  ] = await Promise.all([
    supabase
      .from('daily_attendance')
      .select(`
        id, child_id, unit_id, status, basic_service,
        service_start_time, service_end_time, check_in_time, check_out_time,
        daytime_support, daytime_support_start_time, daytime_support_end_time,
        pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
        dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
        daytime_pickup_departure_time, daytime_pickup_arrival_time, daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
        daytime_dropoff_departure_time, daytime_dropoff_arrival_time, daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id,
        children(id, name, name_kana), units(id, name)
      `)
      .eq('date', targetDate)
      .in('status', ['attended', 'absent'])
      .order('created_at'),
    supabase.from('staff_members').select('id, name').order('name'),
    supabase.from('transport_vehicles').select('id, name').order('name'),
    supabase.from('facilities').select('id').limit(1).single(),
  ])

  const attended = (attendedRaw ?? []) as unknown as AttendedChild[]

  // 既存の記録とデフォルト終了時間は独立しているため並列取得
  const attendanceIds = attended.map((a) => a.id)
  const childIds = [...new Set(attended.map((a) => a.child_id))]

  // 前回コピー用: 過去45日以内の直近の出席データ
  const rangeStart = new Date(targetDate)
  rangeStart.setDate(rangeStart.getDate() - 45)
  const prevRangeStart = rangeStart.toISOString().slice(0, 10)

  const [{ data: recordsRaw }, { data: notifSettings }, { data: prevRaw }, { data: plansRaw }] = await Promise.all([
    attendanceIds.length > 0
      ? supabase
          .from('daily_records')
          .select('id, attendance_id, has_notable_flag')
          .in('attendance_id', attendanceIds)
      : Promise.resolve({ data: [] }),
    facilityRaw
      ? supabase
          .from('notification_settings')
          .select('default_service_end_time')
          .eq('facility_id', facilityRaw.id)
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
    childIds.length > 0
      ? supabase
          .from('daily_attendance')
          .select(`child_id, date, ${TRANSPORT_COLUMNS}`)
          .in('child_id', childIds)
          .eq('status', 'attended')
          .gte('date', prevRangeStart)
          .lt('date', targetDate)
          .order('date', { ascending: false })
      : Promise.resolve({ data: [] }),
    childIds.length > 0
      ? supabase
          .from('usage_plans')
          .select('id, child_id, unit_id, day_of_week, start_date, end_date, pickup_time, dropoff_time, service_start_time, service_end_time, transport_type, daytime_support, daytime_support_start_time, daytime_support_end_time')
          .in('child_id', childIds)
          .eq('is_active', true)
          .lte('start_date', targetDate)
          .or(`end_date.is.null,end_date.gte.${targetDate}`)
      : Promise.resolve({ data: [] }),
  ])
  const records = (recordsRaw ?? []) as unknown as DailyRecord[]
  const recordByAttendanceId = Object.fromEntries(records.map((r) => [r.attendance_id, r]))
  const defaultServiceEndTime = (notifSettings?.default_service_end_time as string | null)?.slice(0, 5) ?? '16:30'

  // ── 前回コピー用: 児童ごとに入力のある直近の行を採用（date降順で取得済み） ──
  const prevRows = (prevRaw ?? []) as unknown as PrevAttendanceRow[]
  const prevByChildId: Record<string, PrevAttendanceRow> = {}
  for (const row of prevRows) {
    if (!prevByChildId[row.child_id] && hasAnyTransportInput(row)) {
      prevByChildId[row.child_id] = row
    }
  }

  // ── スケジュール初期値: 特定日上書き > 曜日別設定 > プランのデフォルト ──
  const dow = new Date(targetDate).getDay()
  const allPlans = (plansRaw ?? []) as unknown as UsagePlanRow[]
  // 対象日の曜日を含むプラン（start=endの一回限りプランは日付フィルタ済みなので常に対象）
  const plansForDate = allPlans.filter(
    (p) => (p.day_of_week ?? []).includes(dow) || (!!p.end_date && p.start_date === p.end_date)
  )
  const planIds = plansForDate.map((p) => p.id)

  const [{ data: daySettingsRaw }, { data: overridesRaw }] = planIds.length > 0
    ? await Promise.all([
        supabase
          .from('usage_plan_day_settings')
          .select('plan_id, day_of_week, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time')
          .in('plan_id', planIds)
          .eq('day_of_week', dow),
        supabase
          .from('usage_plan_date_overrides')
          .select('plan_id, date, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
          .in('plan_id', planIds)
          .eq('date', targetDate),
      ])
    : [{ data: [] }, { data: [] }]

  const daySettings = (daySettingsRaw ?? []) as unknown as DaySettingRow[]
  const overrides = (overridesRaw ?? []) as unknown as DateOverrideRow[]
  const daySettingByPlanId = Object.fromEntries(daySettings.map((d) => [d.plan_id, d]))
  const overrideByPlanId = Object.fromEntries(
    overrides.filter((o) => !o.is_cancelled).map((o) => [o.plan_id, o])
  )

  const resolveDefaults = (plan: UsagePlanRow): ScheduleDefaults => {
    const ov = overrideByPlanId[plan.id]
    const ds = daySettingByPlanId[plan.id]
    return {
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

  // 出席行ごとにプランを解決（ユニット一致を優先）
  const scheduleDefaultsByAttendanceId: Record<string, ScheduleDefaults> = {}
  for (const a of attended) {
    const plan =
      plansForDate.find((p) => p.child_id === a.child_id && p.unit_id === a.unit_id) ??
      plansForDate.find((p) => p.child_id === a.child_id)
    if (plan) scheduleDefaultsByAttendanceId[a.id] = resolveDefaults(plan)
  }

  // ユニットでグループ
  const byUnit: Record<string, { unitName: string; items: AttendedChild[] }> = {}
  attended.forEach((a) => {
    const unitId = a.unit_id
    const unitName = a.units?.name ?? 'ユニット不明'
    if (!byUnit[unitId]) byUnit[unitId] = { unitName, items: [] }
    byUnit[unitId].items.push(a)
  })

  // 前後日
  const d = new Date(targetDate)
  const prevDate = new Date(d)
  prevDate.setDate(d.getDate() - 1)
  const nextDate = new Date(d)
  nextDate.setDate(d.getDate() + 1)

  const writtenCount = records.length
  const totalCount = attended.filter((a) => a.status === 'attended').length

  return (
    <RecordsListBoard
      targetDate={targetDate}
      prevDate={prevDate.toISOString().slice(0, 10)}
      nextDate={nextDate.toISOString().slice(0, 10)}
      byUnit={byUnit}
      staffMembers={(staffMembersRaw ?? []) as { id: string; name: string }[]}
      vehicles={(vehiclesRaw ?? []) as { id: string; name: string }[]}
      recordByAttendanceId={recordByAttendanceId}
      writtenCount={writtenCount}
      totalCount={totalCount}
      defaultServiceEndTime={defaultServiceEndTime}
      prevByChildId={prevByChildId}
      scheduleDefaultsByAttendanceId={scheduleDefaultsByAttendanceId}
    />
  )
}
