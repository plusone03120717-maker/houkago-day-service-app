import { createClient } from '@/lib/supabase/server'
import { ParentCalendar } from '@/components/parent/parent-calendar'

type Child = { id: string; name: string }
type Unit = { id: string; name: string; capacity: number }
type Reservation = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
}
export type FacilityEvent = {
  event_date: string
  event_type: string
  title: string
  affects_reservation: boolean
}

export default async function ParentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  // 自分の子供
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id, children(id, name)')
    .eq('user_id', user.id)
  const children = (parentChildrenRaw ?? [])
    .map((pc) => pc.children as unknown as Child)
    .filter(Boolean)

  const childIds = children.map((c) => c.id)

  // 子供が通うユニット（children_units に登録がない場合は全ユニットを表示）
  const { data: childUnitsRaw } = childIds.length > 0
    ? await supabase
        .from('children_units')
        .select('child_id, unit_id, units(id, name, capacity)')
        .in('child_id', childIds)
    : { data: [] }
  let units = Array.from(
    new Map(
      (childUnitsRaw ?? []).map((cu) => {
        const u = cu.units as unknown as Unit | null
        return u ? [u.id, u] : null
      }).filter((v): v is [string, Unit] => v !== null)
    ).values()
  )
  if (units.length === 0) {
    const { data: allUnitsRaw } = await supabase
      .from('units')
      .select('id, name, capacity')
      .order('name')
    units = (allUnitsRaw ?? []) as Unit[]
  }

  // 当月の予約一覧
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const { data: reservationsRaw } = childIds.length > 0
    ? await supabase
        .from('usage_reservations')
        .select('id, child_id, unit_id, date, status')
        .in('child_id', childIds)
        .gte('date', startDate)
        .lte('date', endDate)
    : { data: [] }
  const reservations = (reservationsRaw ?? []) as Reservation[]

  // 各日の定員充足状況（ユニット別）
  const { data: usageCountRaw } = units.length > 0
    ? await supabase
        .from('usage_reservations')
        .select('unit_id, date')
        .in('unit_id', units.map((u) => u.id))
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['confirmed', 'reserved'])
    : { data: [] }

  // 日付×ユニットごとの予約数を集計
  const usageCountMap: Record<string, Record<string, number>> = {}
  ;(usageCountRaw ?? []).forEach((r) => {
    const row = r as { unit_id: string; date: string }
    if (!usageCountMap[row.date]) usageCountMap[row.date] = {}
    usageCountMap[row.date][row.unit_id] = (usageCountMap[row.date][row.unit_id] ?? 0) + 1
  })

  // 施設カレンダー（休業日・行事）
  const { data: facilityEventsRaw } = await supabase
    .from('facility_events')
    .select('event_date, event_type, title, affects_reservation')
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date')
  const facilityEvents = (facilityEventsRaw ?? []) as FacilityEvent[]

  return (
    <ParentCalendar
      year={year}
      month={month}
      children={children}
      units={units}
      reservations={reservations}
      usageCountMap={usageCountMap}
      facilityEvents={facilityEvents}
      userId={user.id}
    />
  )
}
