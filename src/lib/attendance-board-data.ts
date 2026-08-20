import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** 前回コピー用に取得する送迎・時間系カラム */
const TRANSPORT_COLUMNS = `
  basic_service,
  service_start_time, service_end_time, check_in_time, check_out_time,
  daytime_support, daytime_support_start_time, daytime_support_end_time,
  pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
  dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
  daytime_pickup_departure_time, daytime_pickup_arrival_time, daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
  daytime_dropoff_departure_time, daytime_dropoff_arrival_time, daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id
`

const CHILD_COLUMNS = 'id, name, name_kana, photo_url, allergy_info, medical_info'

const RESERVATION_STATUSES = ['confirmed', 'reserved', 'cancel_waiting']

/**
 * 出席管理ページが必要とする生データ一式。
 * 予約・利用計画・キャンセルのマージ判定は呼び出し側（page.tsx）が行う。
 */
export type AttendanceBoardData = {
  selectedUnitId: string
  units: unknown[]
  staffMembers: { id: string; name: string }[]
  vehicles: { id: string; name: string }[]
  defaultServiceEndTime: string
  reservations: unknown[]
  plans: unknown[]
  attendances: unknown[]
  daySettings: unknown[]
  overrides: unknown[]
  /** 出欠記録がある児童の情報（予約・計画に無い児童の行を作るのに使う） */
  attendanceChildren: unknown[]
  prev: unknown[]
  /** どちらの経路で取得したか（ログ・デバッグ用） */
  source: 'rpc' | 'fallback'
}

type RpcPayload = {
  selected_unit_id: string | null
  units: unknown[] | null
  staff_members: { id: string; name: string }[] | null
  vehicles: { id: string; name: string }[] | null
  default_service_end_time: string | null
  reservations: unknown[] | null
  plans: unknown[] | null
  attendances: unknown[] | null
  day_settings: unknown[] | null
  overrides: unknown[] | null
  attendance_children: unknown[] | null
  prev: unknown[] | null
}

/**
 * 出席管理ページのデータを取得する。
 *
 * 通常は Postgres 関数 get_attendance_board（migration 124）を1回呼ぶだけで
 * 11本のクエリ相当がまとまって返る（サーバー往復1回）。
 * 関数が未作成の環境では従来どおり複数クエリへ自動フォールバックするので、
 * マイグレーション適用前でも動作は変わらない（速度だけが従来のまま）。
 */
export async function loadAttendanceBoardData(
  supabase: ServerClient,
  unitIdParam: string | undefined,
  date: string
): Promise<AttendanceBoardData> {
  const { data, error } = await supabase.rpc('get_attendance_board', {
    p_unit_id: unitIdParam ?? null,
    p_date: date,
  })

  if (!error && data) {
    const p = data as RpcPayload
    return {
      selectedUnitId: p.selected_unit_id ?? '',
      units: p.units ?? [],
      staffMembers: p.staff_members ?? [],
      vehicles: p.vehicles ?? [],
      defaultServiceEndTime: p.default_service_end_time ?? '16:30',
      reservations: p.reservations ?? [],
      plans: p.plans ?? [],
      attendances: p.attendances ?? [],
      daySettings: p.day_settings ?? [],
      overrides: p.overrides ?? [],
      attendanceChildren: p.attendance_children ?? [],
      prev: p.prev ?? [],
      source: 'rpc',
    }
  }

  console.warn(
    '[attendance] get_attendance_board が使えないため複数クエリにフォールバックします:',
    error?.message ?? 'no data'
  )
  return loadViaQueries(supabase, unitIdParam, date)
}

/** RPC が使えない場合の従来経路（サーバー往復4回） */
async function loadViaQueries(
  supabase: ServerClient,
  unitIdParam: string | undefined,
  date: string
): Promise<AttendanceBoardData> {
  const dow = new Date(date).getDay()

  const [
    { data: unitsRaw },
    { data: staffMembersRaw },
    { data: vehiclesRaw },
    { data: facilityRaw },
  ] = await Promise.all([
    supabase
      .from('units')
      .select('id, name, service_type, capacity, facilities (id, name)')
      .order('name'),
    supabase.from('staff_members').select('id, name').order('name'),
    supabase.from('transport_vehicles').select('id, name').order('name'),
    supabase
      .from('facilities')
      .select('id, notification_settings(default_service_end_time)')
      .limit(1)
      .single(),
  ])

  const units = (unitsRaw ?? []) as unknown[]
  const selectedUnitId =
    unitIdParam ?? ((units[0] as { id?: string } | undefined)?.id ?? '')

  const notifSettings =
    (facilityRaw as { notification_settings?: { default_service_end_time: string | null }[] } | null)
      ?.notification_settings?.[0] ?? null
  const defaultServiceEndTime = notifSettings?.default_service_end_time?.slice(0, 5) ?? '16:30'

  const base: AttendanceBoardData = {
    selectedUnitId,
    units,
    staffMembers: (staffMembersRaw ?? []) as { id: string; name: string }[],
    vehicles: (vehiclesRaw ?? []) as { id: string; name: string }[],
    defaultServiceEndTime,
    reservations: [],
    plans: [],
    attendances: [],
    daySettings: [],
    overrides: [],
    attendanceChildren: [],
    prev: [],
    source: 'fallback',
  }

  if (!selectedUnitId) return base

  const [{ data: reservationsRaw }, { data: plansRaw }, { data: attendancesRaw }] =
    await Promise.all([
      supabase
        .from('usage_reservations')
        .select(`id, child_id, date, status, requested_by, children (${CHILD_COLUMNS})`)
        .eq('unit_id', selectedUnitId)
        .eq('date', date)
        .in('status', RESERVATION_STATUSES),
      // 日付・曜日フィルタは呼び出し側で行う
      supabase
        .from('usage_plans')
        .select(
          `id, child_id, start_date, end_date, day_of_week, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time, children (${CHILD_COLUMNS})`
        )
        .eq('unit_id', selectedUnitId)
        .eq('is_active', true),
      supabase
        .from('daily_attendance')
        .select('*')
        .eq('unit_id', selectedUnitId)
        .eq('date', date),
    ])

  type MinimalPlan = {
    id: string
    child_id: string
    start_date: string
    end_date: string | null
    day_of_week: number[] | null
  }
  const plans = (plansRaw ?? []) as unknown as MinimalPlan[]
  const reservations = (reservationsRaw ?? []) as unknown as { child_id: string }[]
  const attendances = (attendancesRaw ?? []) as unknown as { child_id: string }[]

  // RPC 側と同じ集合の作り方をする（呼び出し側が実際に使う集合の上位集合）
  const planIds = plans.map((p) => p.id)
  const todayPlanChildIds = plans
    .filter((p) => {
      if (p.start_date > date) return false
      if (p.end_date !== null && p.end_date < date) return false
      return (p.day_of_week ?? []).includes(dow)
    })
    .map((p) => p.child_id)

  const [{ data: daySettingsRaw }, { data: overridesRaw }] =
    planIds.length > 0
      ? await Promise.all([
          supabase
            .from('usage_plan_day_settings')
            .select('plan_id, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time')
            .in('plan_id', planIds)
            .eq('day_of_week', dow),
          supabase
            .from('usage_plan_date_overrides')
            .select('plan_id, date, transport_type, pickup_time, dropoff_time, service_start_time, service_end_time, is_cancelled')
            .in('plan_id', planIds)
            .eq('date', date),
        ])
      : [{ data: [] }, { data: [] }]

  const attendanceChildIds = [...new Set(attendances.map((a) => a.child_id))]
  const childIds = [
    ...new Set([
      ...reservations.map((r) => r.child_id),
      ...todayPlanChildIds,
      ...attendanceChildIds,
    ]),
  ]

  const rangeStart = new Date(date)
  rangeStart.setDate(rangeStart.getDate() - 45)
  const prevRangeStart = rangeStart.toISOString().slice(0, 10)

  const [{ data: attendanceChildrenRaw }, { data: prevRaw }] = await Promise.all([
    attendanceChildIds.length > 0
      ? supabase.from('children').select(CHILD_COLUMNS).in('id', attendanceChildIds)
      : Promise.resolve({ data: [] as unknown[] }),
    childIds.length > 0
      ? supabase
          .from('daily_attendance')
          .select(`child_id, date, ${TRANSPORT_COLUMNS}`)
          .in('child_id', childIds)
          .eq('status', 'attended')
          .gte('date', prevRangeStart)
          .lt('date', date)
          .order('date', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  return {
    ...base,
    reservations: (reservationsRaw ?? []) as unknown[],
    plans: (plansRaw ?? []) as unknown[],
    attendances: (attendancesRaw ?? []) as unknown[],
    daySettings: (daySettingsRaw ?? []) as unknown[],
    overrides: (overridesRaw ?? []) as unknown[],
    attendanceChildren: (attendanceChildrenRaw ?? []) as unknown[],
    prev: (prevRaw ?? []) as unknown[],
  }
}
