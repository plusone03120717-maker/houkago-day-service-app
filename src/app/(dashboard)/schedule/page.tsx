export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ScheduleBoard } from '@/components/schedule/schedule-board'

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const date = params.date ?? today
  const view = (params.view ?? 'day') as 'day' | 'week' | 'month'

  // 表示範囲を決定
  const [y, m, d] = date.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const monthEnd   = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

  // ─── 送迎スケジュール（迎え・帰り） ──────────────────────────────────────
  const { data: transportRaw } = await supabase
    .from('transport_schedules')
    .select(`
      id, direction, departure_time, date, unit_id,
      transport_vehicles (id, name),
      staff_members (id, name),
      transport_details (
        id, child_id, pickup_time, sort_order,
        children (id, name)
      )
    `)
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .order('date')
    .order('departure_time')

  // ─── スタッフシフト ──────────────────────────────────────────────────────
  const { data: shiftsRaw } = await supabase
    .from('staff_shifts')
    .select('id, staff_id, date, shift_type, start_time, end_time, break_start_time, break_end_time')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .not('shift_type', 'in', '("off","holiday")')

  // ─── スタッフ名マップ ───────────────────────────────────────────────────
  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['admin', 'staff'])

  // ─── 子どもの利用予定（出席予定） ────────────────────────────────────────
  const { data: attendanceRaw } = await supabase
    .from('daily_attendance')
    .select('id, child_id, date, unit_id, status, children(id, name)')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .neq('status', 'absent')

  // ─── モニタリング記録 ────────────────────────────────────────────────────
  const { data: monitoringRaw } = await supabase
    .from('monitoring_records')
    .select('id, child_id, record_date, overall_status, children(id, name)')
    .gte('record_date', monthStart)
    .lte('record_date', monthEnd)

  // ─── カスタムイベント ────────────────────────────────────────────────────
  const { data: customEventsRaw } = await supabase
    .from('schedule_events')
    .select('id, title, event_type, event_date, start_time, end_time, all_day, note, child_id, children(id, name)')
    .gte('event_date', monthStart)
    .lte('event_date', monthEnd)
    .order('event_date')
    .order('start_time')

  // ─── ユニット一覧 ───────────────────────────────────────────────────────
  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')

  // ─── 施設ID ─────────────────────────────────────────────────────────────
  const { data: facilityRaw } = await supabase
    .from('facilities')
    .select('id')
    .limit(1)
    .single()

  // ─── 児童一覧（モニタリング予定の子ども選択用） ──────────────────────────
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, name')
    .order('name')

  return (
    <ScheduleBoard
      date={date}
      view={view}
      transportSchedules={(transportRaw ?? []) as unknown as TransportScheduleRaw[]}
      staffShifts={(shiftsRaw ?? []) as unknown as StaffShiftRaw[]}
      users={(usersRaw ?? []) as { id: string; name: string }[]}
      attendance={(attendanceRaw ?? []) as unknown as AttendanceRaw[]}
      monitoringRecords={(monitoringRaw ?? []) as unknown as MonitoringRaw[]}
      customEvents={(customEventsRaw ?? []) as unknown as CustomEventRaw[]}
      units={(unitsRaw ?? []) as { id: string; name: string }[]}
      facilityId={facilityRaw?.id ?? null}
      children={(childrenRaw ?? []) as { id: string; name: string }[]}
    />
  )
}

// ─── 型エクスポート（component と共有） ────────────────────────────────────

export type TransportScheduleRaw = {
  id: string
  direction: 'pickup' | 'dropoff'
  departure_time: string | null
  date: string
  unit_id: string | null
  transport_vehicles: { id: string; name: string } | null
  staff_members: { id: string; name: string } | null
  transport_details: {
    id: string
    child_id: string
    pickup_time: string | null
    sort_order: number | null
    children: { id: string; name: string } | null
  }[]
}

export type StaffShiftRaw = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  break_start_time: string | null
  break_end_time: string | null
}

export type AttendanceRaw = {
  id: string
  child_id: string
  date: string
  unit_id: string | null
  status: string
  children: { id: string; name: string } | null
}

export type MonitoringRaw = {
  id: string
  child_id: string
  record_date: string
  overall_status: string
  children: { id: string; name: string } | null
}

export type CustomEventRaw = {
  id: string
  title: string
  event_type: 'meeting' | 'monitoring' | 'external' | 'other'
  event_date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  note: string | null
  child_id: string | null
  children: { id: string; name: string } | null
}
