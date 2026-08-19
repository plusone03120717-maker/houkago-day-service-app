export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { formatDate, getTodayJST } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { Schedule, AttendingChild, UnitChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }
type Driver = { id: string; name: string }

const SCHEDULE_SELECT = `
  id, direction, departure_time, route_order,
  driver_member_id,
  transport_vehicles (id, name, capacity),
  staff_members (id, name),
  transport_details (
    id, child_id, pickup_location, pickup_time, actual_pickup_time, status, parent_notified, sort_order,
    driver_member_id, vehicle_id,
    children (id, name, name_kana, address, school_id, schools(id, name))
  )
`

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
    { data: attendingChildrenRaw },
    { data: allChildrenRaw },
  ] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('transport_schedules')
          .select(SCHEDULE_SELECT)
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
          .order('direction')
      : ({ data: [] } as { data: unknown[] }),
    vehiclesPromise,
    driversPromise,
    selectedUnitId
      ? supabase
          .from('daily_attendance')
          .select('child_id, pickup_type, children(id, name, name_kana)')
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
          .neq('status', 'absent')
      : ({ data: [] } as { data: unknown[] }),
    selectedUnitId
      ? supabase
          .from('usage_plans')
          .select('child_id, children(id, name, name_kana, address, school_id, schools(id, name))')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
      : ({ data: [] } as { data: unknown[] }),
  ])

  const schedules = (schedulesRaw ?? []) as unknown as Schedule[]
  const vehicles = (vehiclesRaw ?? []) as Vehicle[]
  const drivers = (driversRaw ?? []) as Driver[]
  const attendingChildren = (attendingChildrenRaw ?? []) as unknown as AttendingChild[]

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
      schedules={schedules}
      vehicles={vehicles}
      drivers={drivers}
      attendingChildren={attendingChildren}
      allChildren={allChildren}
    />
  )
}
