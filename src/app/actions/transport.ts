'use server'

import { createClient } from '@/lib/supabase/server'
import { buildRouteGroups, nearestNeighborSort, type RouteChildData } from '@/lib/transport-route'

type ChildRow = {
  id: string
  name: string
  postal_code: string | null
  address: string | null
  school_id: string | null
  schools: { id: string; name: string; latitude: number | null; longitude: number | null } | null
}

type TransportSettingRow = {
  child_id: string
  transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
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
  const todayDow = new Date(date).getDay()

  // 利用計画から今日の対象児童を取得
  const { data: plansRaw } = await supabase
    .from('usage_plans')
    .select('child_id, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .contains('day_of_week', [todayDow])

  // 個別予約からも取得（重複は後でマージ）
  const { data: reservationsRaw } = await supabase
    .from('usage_reservations')
    .select('child_id, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
    .eq('unit_id', unitId)
    .eq('date', date)
    .in('status', ['confirmed', 'reserved'])

  // 児童をユニーク化
  const childrenMap = new Map<string, ChildRow>()
  for (const p of plansRaw ?? []) {
    if (p.child_id && !childrenMap.has(p.child_id)) {
      childrenMap.set(p.child_id, p.children as unknown as ChildRow)
    }
  }
  for (const r of reservationsRaw ?? []) {
    if (r.child_id && !childrenMap.has(r.child_id)) {
      childrenMap.set(r.child_id, r.children as unknown as ChildRow)
    }
  }

  if (childrenMap.size === 0) return

  const childIds = [...childrenMap.keys()]

  // 送迎設定を取得
  const { data: settingsRaw } = await supabase
    .from('child_transport_settings')
    .select('child_id, transport_type, pickup_location_type')
    .in('child_id', childIds)

  const settingsMap = new Map<string, TransportSettingRow>(
    ((settingsRaw ?? []) as TransportSettingRow[]).map((s) => [s.child_id, s])
  )

  // 送迎設定がある児童のみ対象（noneは除外）
  const pickupCandidates: RouteChildData[] = []
  const dropoffCandidates: RouteChildData[] = []

  for (const [childId, childData] of childrenMap) {
    const setting = settingsMap.get(childId)
    if (!setting || setting.transport_type === 'none') continue

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
      pickup_location_type: setting.pickup_location_type,
    }

    if (setting.transport_type === 'both' || setting.transport_type === 'pickup_only') {
      pickupCandidates.push(routeChild)
    }
    if (setting.transport_type === 'both' || setting.transport_type === 'dropoff_only') {
      dropoffCandidates.push(routeChild)
    }
  }

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

    if (schedErr) {
      if (schedErr.code === '23505') continue  // 既に存在する場合はスキップ
      continue
    }
    if (!schedule) continue

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
