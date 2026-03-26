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

/** 'HH:MM:SS' または 'HH:MM' を1時間単位のスロット文字列に丸める（例: '15:30' → '15:00:00'） */
function toHourSlot(timeStr: string | null): string | null {
  if (!timeStr) return null
  const hour = parseInt(timeStr.split(':')[0], 10)
  return `${String(hour).padStart(2, '0')}:00:00`
}

export async function autoCreateTransportSchedules(unitId: string, date: string) {
  const supabase = await createClient()
  const todayDow = new Date(date).getDay()

  // 利用計画から今日の対象児童を取得（送迎時間も含む）
  const { data: plansRaw } = await supabase
    .from('usage_plans')
    .select('child_id, pickup_time, dropoff_time, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
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

  // 児童をユニーク化（planが優先 → 時間情報を保持）
  const childrenMap = new Map<string, ChildRow>()
  const pickupTimeMap = new Map<string, string | null>()  // child_id → お迎えスロット
  const dropoffTimeMap = new Map<string, string | null>() // child_id → お送りスロット

  for (const p of plansRaw ?? []) {
    if (p.child_id && !childrenMap.has(p.child_id)) {
      childrenMap.set(p.child_id, p.children as unknown as ChildRow)
      pickupTimeMap.set(p.child_id, toHourSlot(p.pickup_time as string | null))
      dropoffTimeMap.set(p.child_id, toHourSlot(p.dropoff_time as string | null))
    }
  }
  for (const r of reservationsRaw ?? []) {
    if (r.child_id && !childrenMap.has(r.child_id)) {
      childrenMap.set(r.child_id, r.children as unknown as ChildRow)
      // 個別予約は時間情報なし → nullスロット
      pickupTimeMap.set(r.child_id, null)
      dropoffTimeMap.set(r.child_id, null)
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

  // 送迎設定がある児童を時間スロットごとにグループ化
  // key = 時間スロット文字列 or null（時間未設定）
  const pickupSlots = new Map<string | null, RouteChildData[]>()
  const dropoffSlots = new Map<string | null, RouteChildData[]>()

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
      const slot = pickupTimeMap.get(childId) ?? null
      if (!pickupSlots.has(slot)) pickupSlots.set(slot, [])
      pickupSlots.get(slot)!.push(routeChild)
    }
    if (setting.transport_type === 'both' || setting.transport_type === 'dropoff_only') {
      const slot = dropoffTimeMap.get(childId) ?? null
      if (!dropoffSlots.has(slot)) dropoffSlots.set(slot, [])
      dropoffSlots.get(slot)!.push(routeChild)
    }
  }

  // pickup・dropoff それぞれ、スロットごとにスケジュールを作成
  for (const direction of ['pickup', 'dropoff'] as const) {
    const slotsMap = direction === 'pickup' ? pickupSlots : dropoffSlots

    for (const [slot, candidates] of slotsMap) {
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
          departure_time: slot,  // 時間スロット（例: '15:00:00'）または null
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
}
