export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { TransportRow, UnitChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
type Driver = { id: string; name: string }

const SCHEDULE_SELECT = `
  id, direction, departure_time,
  transport_details (
    id, child_id, pickup_location, pickup_time, actual_pickup_time, status, sort_order,
    driver_member_id, vehicle_id,
    children (id, name, name_kana, address, school_id, schools(id, name))
  )
`

/** ページ内で使う生スケジュール（クライアントには行に平坦化して渡す） */
type RawSchedule = {
  id: string
  direction: string
  departure_time: string | null
  transport_details: {
    id: string
    child_id: string
    pickup_location: string | null
    pickup_time: string | null
    actual_pickup_time: string | null
    status: string
    sort_order: number
    driver_member_id: string | null
    vehicle_id: string | null
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

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  // 利用計画から送迎スケジュールを生成・補完（未追加の児童を自動追加）
  if (selectedUnitId) {
    await autoCreateTransportSchedules(selectedUnitId, today)
  }

  // スケジュール生成後に一括取得
  const [
    { data: schedulesRaw },
    { data: vehiclesRaw },
    { data: driversRaw },
    { data: allChildrenRaw },
  ] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('transport_schedules')
          .select(SCHEDULE_SELECT)
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
      : ({ data: [] } as { data: unknown[] }),
    vehiclesPromise,
    driversPromise,
    selectedUnitId
      ? supabase
          .from('usage_plans')
          .select('child_id, children(id, name, name_kana, address, school_id, schools(id, name))')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
      : ({ data: [] } as { data: unknown[] }),
  ])

  const schedules = (schedulesRaw ?? []) as unknown as RawSchedule[]
  const vehicles = (vehiclesRaw ?? []) as Vehicle[]
  const drivers = (driversRaw ?? []) as Driver[]

  // 便ごとの入れ子をやめ、児童1人1行のフラットな一覧に変換する。
  // 便は表からは消えたが DB 上は方向ごとの入れ物として残るため、
  // 追加・方向変更で使う schedule_id を方向別に控えておく。
  const scheduleIdByDirection: { pickup: string | null; dropoff: string | null } = {
    pickup: null,
    dropoff: null,
  }
  const rows: TransportRow[] = []

  for (const sched of schedules) {
    const direction = sched.direction === 'pickup' ? 'pickup' : 'dropoff'
    if (!scheduleIdByDirection[direction]) scheduleIdByDirection[direction] = sched.id

    for (const d of sched.transport_details ?? []) {
      // 児童個別の時刻が未設定なら便の出発時刻を暫定値として表示する
      const time = (d.pickup_time ?? sched.departure_time)?.slice(0, 5) ?? null
      rows.push({
        id: d.id,
        childId: d.child_id,
        direction,
        name: d.children?.name ?? '不明',
        nameKana: d.children?.name_kana ?? null,
        time,
        hasOwnTime: !!d.pickup_time,
        actualTime: d.actual_pickup_time?.slice(0, 5) ?? null,
        location: d.pickup_location,
        driverMemberId: d.driver_member_id,
        vehicleId: d.vehicle_id,
        sortOrder: d.sort_order,
        schoolName: d.children?.schools?.name ?? null,
        homeAddress: d.children?.address ?? null,
      })
    }
  }

  // 送迎時間の早い順。時間未設定は末尾、同時刻内は sort_order → 名前順
  rows.sort((a, b) => {
    if (a.time && b.time) {
      if (a.time !== b.time) return a.time < b.time ? -1 : 1
    } else if (a.time) return -1
    else if (b.time) return 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja')
  })

  // child_id で重複除去
  const allChildrenMap = new Map<string, UnitChild>()
  for (const p of allChildrenRaw ?? []) {
    const row = p as { child_id: string; children: unknown }
    if (row.child_id && !allChildrenMap.has(row.child_id)) {
      allChildrenMap.set(row.child_id, row.children as unknown as UnitChild)
    }
  }
  const allChildren = [...allChildrenMap.values()].sort((a, b) =>
    (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  return (
    <TransportManageBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      rows={rows}
      scheduleIdByDirection={scheduleIdByDirection}
      vehicles={vehicles}
      drivers={drivers}
      allChildren={allChildren}
    />
  )
}
