export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { Schedule, AttendingChild, UnitChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }

const SCHEDULE_SELECT = `
  id, direction, departure_time, route_order,
  transport_vehicles (id, name, capacity),
  transport_details (
    id, child_id, pickup_location, pickup_time, actual_pickup_time, status, parent_notified,
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
  const today = params.date ?? formatDate(new Date(), 'yyyy-MM-dd')

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type')
    .order('name')
  const units = (unitsRaw ?? []) as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const { data: schedulesRaw } = selectedUnitId
    ? await supabase
        .from('transport_schedules')
        .select(SCHEDULE_SELECT)
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .order('direction')
    : { data: [] }
  let schedules = (schedulesRaw ?? []) as unknown as Schedule[]

  const { data: vehiclesRaw } = await supabase
    .from('transport_vehicles')
    .select('id, name, capacity')
    .order('name')
  const vehicles = (vehiclesRaw ?? []) as Vehicle[]

  const { data: attendingChildrenRaw } = selectedUnitId
    ? await supabase
        .from('daily_attendance')
        .select('child_id, pickup_type, children(id, name, name_kana)')
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .neq('status', 'absent')
    : { data: [] }
  const attendingChildren = (attendingChildrenRaw ?? []) as unknown as AttendingChild[]

  // このユニットに紐づく全児童（利用計画から）
  const { data: allChildrenRaw } = selectedUnitId
    ? await supabase
        .from('usage_plans')
        .select('child_id, children(id, name, name_kana, address, school_id, schools(id, name))')
        .eq('unit_id', selectedUnitId)
        .eq('is_active', true)
    : { data: [] }

  // child_id で重複除去
  const allChildrenMap = new Map<string, UnitChild>()
  for (const p of allChildrenRaw ?? []) {
    if (p.child_id && !allChildrenMap.has(p.child_id as string)) {
      allChildrenMap.set(p.child_id as string, p.children as unknown as UnitChild)
    }
  }
  const allChildren = [...allChildrenMap.values()].sort((a, b) =>
    (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  // スケジュール未作成の場合は利用計画から自動生成
  if (schedules.length === 0 && selectedUnitId) {
    await autoCreateTransportSchedules(selectedUnitId, today)
    const { data: newSchedulesRaw } = await supabase
      .from('transport_schedules')
      .select(SCHEDULE_SELECT)
      .eq('unit_id', selectedUnitId)
      .eq('date', today)
      .order('direction')
    schedules = (newSchedulesRaw ?? []) as unknown as Schedule[]
  }

  return (
    <TransportManageBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      schedules={schedules}
      vehicles={vehicles}
      attendingChildren={attendingChildren}
      allChildren={allChildren}
    />
  )
}
