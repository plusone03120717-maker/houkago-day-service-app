export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { TransportRow, UnitChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'
import {
  fetchScheduleDefaults,
  resolveDropoffIsDaytime,
  type ScheduleDefaults,
} from '@/lib/schedule-defaults'
import { ALL_UNITS, unitChildKey } from '@/lib/attendance-board-data'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
type Driver = { id: string; name: string }

// 送迎明細が持つのは「誰を・どこで・どの順に」だけ。
// 時刻・ドライバー・車種はその日の記録（daily_attendance）が唯一の正。
const SCHEDULE_SELECT = `
  id, unit_id, direction,
  transport_details (
    id, child_id, pickup_location, sort_order, trip_group_id,
    children (id, name, name_kana, address, school_id, schools(id, name))
  )
`

// 日中一時まで残る児童は、お送りが日中一時側の欄に入る（@/lib/schedule-defaults）。
// どちらに入っているかを判定するため、利用時間・日中一時の時刻も一緒に読む。
const ATTENDANCE_SELECT = `
  child_id, unit_id, status,
  pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
  dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
  daytime_dropoff_departure_time, daytime_dropoff_arrival_time,
  daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id,
  service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time
`

type RawSchedule = {
  id: string
  unit_id: string
  direction: string
  transport_details: {
    id: string
    child_id: string
    pickup_location: string | null
    sort_order: number
    trip_group_id: string | null
    children: {
      id: string
      name: string
      name_kana: string | null
      address: string | null
      school_id: string | null
      schools: { id: string; name: string } | null
    } | null
  }[]
}

type AttendanceRow = {
  child_id: string
  unit_id: string
  status: string
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  service_end_time: string | null
  daytime_support: boolean | null
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? getTodayJST()

  // 車両・運転手はユニット選択にもスケジュール生成にも依存しないため、
  // ここで先に走らせて autoCreate の待ち時間に重ねる（.then で即時実行）
  const vehiclesPromise = supabase.from('transport_vehicles').select('id, name, capacity').order('name').then((r) => r)
  const driversPromise = supabase.from('staff_members').select('id, name').order('name').then((r) => r)

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type')
    .order('name')
  const units = (unitsRaw ?? []) as Unit[]

  // ユニット未指定は「すべて」。まず全ユニットの送迎をまとめて見せ、
  // そこからユニットボタンで絞り込む。
  const showAllUnits = !params.unit || params.unit === ALL_UNITS
  const selectedUnitId = showAllUnits ? ALL_UNITS : params.unit ?? ''
  const targetUnitIds = showAllUnits
    ? units.map((u) => u.id)
    : units.filter((u) => u.id === selectedUnitId).map((u) => u.id)

  // 利用計画から送迎対象の児童を補完（未追加の児童を自動追加）
  await Promise.all(targetUnitIds.map((id) => autoCreateTransportSchedules(id, today)))

  const [
    { data: schedulesRaw, error: schedulesError },
    { data: vehiclesRaw },
    { data: driversRaw },
    { data: attendanceRaw, error: attendanceError },
    { data: allChildrenRaw },
    scheduleDefaults,
  ] = await Promise.all([
    targetUnitIds.length > 0
      ? supabase
          .from('transport_schedules')
          .select(SCHEDULE_SELECT)
          .in('unit_id', targetUnitIds)
          .eq('date', today)
      : ({ data: [], error: null } as { data: unknown[]; error: null }),
    vehiclesPromise,
    driversPromise,
    targetUnitIds.length > 0
      ? supabase
          .from('daily_attendance')
          .select(ATTENDANCE_SELECT)
          .in('unit_id', targetUnitIds)
          .eq('date', today)
      : ({ data: [], error: null } as { data: unknown[]; error: null }),
    targetUnitIds.length > 0
      ? supabase
          .from('usage_plans')
          .select('child_id, unit_id, children(id, name, name_kana, address, school_id, schools(id, name))')
          .in('unit_id', targetUnitIds)
          .eq('is_active', true)
      : ({ data: [] } as { data: unknown[] }),
    // 予定値はユニットごとに解決する（計画はユニット単位なので混ぜられない）
    Promise.all(targetUnitIds.map((id) => fetchScheduleDefaults(supabase, id, today))).then(
      (list) => {
        const byKey: Record<string, ScheduleDefaults> = {}
        list.forEach((defaults, i) => {
          for (const [childId, v] of Object.entries(defaults)) {
            byKey[unitChildKey(targetUnitIds[i], childId)] = v
          }
        })
        return byKey
      }
    ),
  ])

  // 取得に失敗したときは「0件」として黙って空表示にせず、原因をそのまま画面に出す。
  // 未適用のマイグレーションで列が無い、といった不具合が「予定なし」に化けるのを防ぐ。
  const loadError = schedulesError?.message ?? attendanceError?.message ?? null
  if (loadError) {
    console.error('[transport] 送迎一覧の取得に失敗しました', schedulesError ?? attendanceError)
  }

  const schedules = (schedulesRaw ?? []) as unknown as RawSchedule[]
  const vehicles = (vehiclesRaw ?? []) as Vehicle[]
  const drivers = (driversRaw ?? []) as Driver[]

  // 「すべて」表示ではユニットをまたぐため、出席記録はユニット×児童で引く
  const attendanceByChild = new Map<string, AttendanceRow>()
  for (const a of (attendanceRaw ?? []) as unknown as AttendanceRow[]) {
    attendanceByChild.set(unitChildKey(a.unit_id, a.child_id), a)
  }
  const unitNameById = new Map(units.map((u) => [u.id, u.name]))

  // 便ごとの入れ子をやめ、児童1人1行のフラットな一覧に変換する。
  // 便は表からは消えたが DB 上は方向ごとの入れ物として残るため、
  // 追加・方向変更で使う schedule_id を方向別に控えておく。
  // ユニットごと・方向ごとの入れ物スケジュール
  const scheduleIdsByUnit: Record<string, { pickup: string | null; dropoff: string | null }> = {}
  for (const id of targetUnitIds) scheduleIdsByUnit[id] = { pickup: null, dropoff: null }
  const rows: TransportRow[] = []

  for (const sched of schedules) {
    const direction = sched.direction === 'pickup' ? 'pickup' : 'dropoff'
    const slot = (scheduleIdsByUnit[sched.unit_id] ??= { pickup: null, dropoff: null })
    if (!slot[direction]) slot[direction] = sched.id

    for (const d of sched.transport_details ?? []) {
      const att = attendanceByChild.get(unitChildKey(sched.unit_id, d.child_id))
      const plan = scheduleDefaults[unitChildKey(sched.unit_id, d.child_id)]

      // お迎えは「子どもと合流する時刻」＝到着、お送りは「施設を出る時刻」＝出発。
      // 記録が無ければ利用スケジュールの予定値を未確定として表示する。
      // お送りは、日中一時まで残る児童だけ日中一時側の欄が記録先になる。
      const isDaytimeDropoff = direction === 'dropoff' && resolveDropoffIsDaytime(att, plan)
      const recorded =
        direction === 'pickup'
          ? att?.pickup_arrival_time
          : isDaytimeDropoff
          ? att?.daytime_dropoff_departure_time
          : att?.dropoff_departure_time
      const planned = direction === 'pickup' ? plan?.pickupTime : plan?.dropoffTime

      rows.push({
        id: d.id,
        childId: d.child_id,
        unitId: sched.unit_id,
        unitName: unitNameById.get(sched.unit_id) ?? '',
        direction,
        name: d.children?.name ?? '不明',
        nameKana: d.children?.name_kana ?? null,
        time: (recorded ?? planned)?.slice(0, 5) ?? null,
        isConfirmed: !!recorded,
        isAbsent: att?.status === 'absent',
        location: d.pickup_location,
        driverMemberId:
          (direction === 'pickup'
            ? att?.pickup_driver_member_id
            : isDaytimeDropoff
            ? att?.daytime_dropoff_driver_member_id
            : att?.dropoff_driver_member_id) ?? null,
        vehicleId:
          (direction === 'pickup'
            ? att?.pickup_vehicle_id
            : isDaytimeDropoff
            ? att?.daytime_dropoff_vehicle_id
            : att?.dropoff_vehicle_id) ?? null,
        sortOrder: d.sort_order,
        // 手動で組み分けされていれば その ID、なければ 区分・時間・場所で自動判定
        // 自動判定の便はユニットをまたがない（記録先が別のため）
        groupKey:
          d.trip_group_id ??
          `auto|${sched.unit_id}|${direction}|${(recorded ?? planned)?.slice(0, 5) ?? ''}|${d.pickup_location ?? ''}`,
        isManualGroup: !!d.trip_group_id,
        schoolName: d.children?.schools?.name ?? null,
        homeAddress: d.children?.address ?? null,
      })
    }
  }

  // 便（groupKey）ごとにまとめてから並べる。
  // 手動でまとめた便は時間や場所がばらばらでも1つの塊として扱うため、
  // 行単体ではなく便単位で並べないと画面上で離れてしまう。
  const byGroup = new Map<string, TransportRow[]>()
  for (const r of rows) {
    const list = byGroup.get(r.groupKey)
    if (list) list.push(r)
    else byGroup.set(r.groupKey, [r])
  }

  /** 便の代表値。並び順は「一番早い送迎時間」で決める */
  const groupSortKey = (members: TransportRow[]) => {
    const times = members.map((m) => m.time).filter((t): t is string => !!t)
    return {
      time: times.length > 0 ? times.sort()[0] : null,
      direction: members[0].direction,
      location: members[0].location ?? '',
      sortOrder: Math.min(...members.map((m) => m.sortOrder)),
    }
  }

  // 便の中は 送迎時間 → sort_order → 名前順
  const sortMembers = (members: TransportRow[]) =>
    members.sort((a, b) => {
      if (a.time && b.time) {
        if (a.time !== b.time) return a.time < b.time ? -1 : 1
      } else if (a.time) return -1
      else if (b.time) return 1
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja')
    })

  // 送迎時間の早い順。時間未設定の便は末尾。同時刻は 区分 → 場所 → sort_order
  const sortedGroups = [...byGroup.values()]
    .map((members) => ({ members: sortMembers(members), key: groupSortKey(members) }))
    .sort((a, b) => {
      if (a.key.time && b.key.time) {
        if (a.key.time !== b.key.time) return a.key.time < b.key.time ? -1 : 1
      } else if (a.key.time) return -1
      else if (b.key.time) return 1
      if (a.key.direction !== b.key.direction) return a.key.direction === 'pickup' ? -1 : 1
      if (a.key.location !== b.key.location) return a.key.location.localeCompare(b.key.location, 'ja')
      return a.key.sortOrder - b.key.sortOrder
    })

  const orderedRows = sortedGroups.flatMap((g) => g.members)

  // ユニット×児童で重複除去（どのユニットの子かも持たせる）
  const allChildrenMap = new Map<string, UnitChild>()
  for (const p of allChildrenRaw ?? []) {
    const row = p as { child_id: string; unit_id: string; children: unknown }
    const key = unitChildKey(row.unit_id, row.child_id)
    if (row.child_id && row.children && !allChildrenMap.has(key)) {
      allChildrenMap.set(key, {
        ...(row.children as unknown as UnitChild),
        unitId: row.unit_id,
        unitName: unitNameById.get(row.unit_id) ?? '',
      })
    }
  }
  const allChildren = [...allChildrenMap.values()].sort(
    (a, b) =>
      a.unitName.localeCompare(b.unitName, 'ja') ||
      (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  return (
    <TransportManageBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      rows={orderedRows}
      scheduleIdsByUnit={scheduleIdsByUnit}
      vehicles={vehicles}
      drivers={drivers}
      allChildren={allChildren}
      loadError={loadError}
    />
  )
}
