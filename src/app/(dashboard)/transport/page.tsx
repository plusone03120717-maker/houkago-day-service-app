import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { TransportManageBoard } from '@/components/transport/transport-board'
import type { Schedule, AttendingChild } from '@/components/transport/transport-board'
import { autoCreateTransportSchedules } from '@/app/actions/transport'

type Unit = { id: string; name: string; service_type: string }
type Vehicle = { id: string; name: string; capacity: number }

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
        .select(`
          id, direction, departure_time, route_order,
          transport_vehicles (id, name, capacity),
          users!transport_schedules_driver_staff_id_fkey (name),
          transport_details (
            id, child_id, pickup_location, pickup_time, actual_pickup_time, status, parent_notified,
            children (id, name, name_kana)
          )
        `)
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .order('direction')
    : { data: [] }
  const schedules = (schedulesRaw ?? []) as unknown as Schedule[]

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
        .eq('status', 'attended')
    : { data: [] }
  const attendingChildren = (attendingChildrenRaw ?? []) as unknown as AttendingChild[]

  // スケジュール未作成かつ送迎対象児童がいる場合は自動生成
  let finalSchedules = schedules
  if (schedules.length === 0 && attendingChildren.some((c) => c.pickup_type !== 'none') && selectedUnitId) {
    await autoCreateTransportSchedules(selectedUnitId, today)
    const { data: newSchedulesRaw } = await supabase
      .from('transport_schedules')
      .select(`
        id, direction, departure_time, route_order,
        transport_vehicles (id, name, capacity),
        users!transport_schedules_driver_staff_id_fkey (name),
        transport_details (
          id, child_id, pickup_location, pickup_time, actual_pickup_time, status, parent_notified,
          children (id, name, name_kana)
        )
      `)
      .eq('unit_id', selectedUnitId)
      .eq('date', today)
      .order('direction')
    finalSchedules = (newSchedulesRaw ?? []) as unknown as Schedule[]
  }

  return (
    <TransportManageBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      schedules={finalSchedules}
      vehicles={vehicles}
      attendingChildren={attendingChildren}
    />
  )
}
