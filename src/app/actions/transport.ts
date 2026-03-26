'use server'

import { createClient } from '@/lib/supabase/server'
import { buildRouteGroups, nearestNeighborSort, type RouteChildData } from '@/lib/transport-route'

type AttendanceRow = {
  child_id: string
  pickup_type: string
  children: {
    id: string
    name: string
    postal_code: string | null
    address: string | null
    school_id: string | null
    schools: { id: string; name: string; latitude: number | null; longitude: number | null } | null
  } | null
}

type TransportSettingRow = {
  child_id: string
  pickup_location_type: 'home' | 'school'
}

function getPickupLocation(c: RouteChildData, direction: 'pickup' | 'dropoff'): string | null {
  if (direction === 'pickup' && c.pickup_location_type === 'school') {
    return c.children?.schools?.name ?? null
  }
  return c.children?.address ?? null
}

export async function autoCreateTransportSchedules(unitId: string, date: string) {
  const supabase = await createClient()

  // 出席中かつ送迎対象の児童を取得
  const { data: attendanceRaw, error: attErr } = await supabase
    .from('daily_attendance')
    .select('child_id, pickup_type, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
    .eq('unit_id', unitId)
    .eq('date', date)
    .eq('status', 'attended')
    .in('pickup_type', ['both', 'pickup_only', 'dropoff_only'])

  if (attErr || !attendanceRaw || attendanceRaw.length === 0) return

  const attendance = attendanceRaw as unknown as AttendanceRow[]
  const childIds = attendance.map((a) => a.child_id)

  // 送迎設定を取得
  const { data: settingsRaw } = await supabase
    .from('child_transport_settings')
    .select('child_id, pickup_location_type')
    .in('child_id', childIds)

  const settingsMap = new Map(
    ((settingsRaw ?? []) as TransportSettingRow[]).map((s) => [s.child_id, s.pickup_location_type])
  )

  const pickupCandidates: RouteChildData[] = attendance
    .filter((a) => a.pickup_type === 'both' || a.pickup_type === 'pickup_only')
    .map((a) => ({
      child_id: a.child_id,
      children: a.children as RouteChildData['children'],
      pickup_location_type: settingsMap.get(a.child_id) ?? 'home',
    }))

  const dropoffCandidates: RouteChildData[] = attendance
    .filter((a) => a.pickup_type === 'both' || a.pickup_type === 'dropoff_only')
    .map((a) => ({
      child_id: a.child_id,
      children: a.children as RouteChildData['children'],
      pickup_location_type: settingsMap.get(a.child_id) ?? 'home',
    }))

  // pickup・dropoff それぞれスケジュールを作成
  for (const direction of ['pickup', 'dropoff'] as const) {
    const candidates = direction === 'pickup' ? pickupCandidates : dropoffCandidates
    if (candidates.length === 0) continue

    const groups = nearestNeighborSort(buildRouteGroups(candidates, direction))
    const orderedChildren = groups.flatMap((g) => g.children)

    const { data: schedule, error: schedErr } = await supabase
      .from('transport_schedules')
      .insert({
        unit_id: unitId,
        date,
        direction,
        vehicle_id: null,
        departure_time: null,
        route_order: [],
      })
      .select('id')
      .single()

    if (schedErr || !schedule) continue

    if (orderedChildren.length > 0) {
      await supabase.from('transport_details').insert(
        orderedChildren.map((c) => ({
          schedule_id: schedule.id,
          child_id: c.child_id,
          pickup_location: getPickupLocation(c, direction),
          status: 'scheduled',
        }))
      )
    }
  }

}
