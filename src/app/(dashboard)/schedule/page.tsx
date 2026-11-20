export const dynamic = 'force-dynamic'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { keepActive, loadRetired, transportIdsIn } from '@/lib/retired'
import { getStaffAccess } from '@/lib/require-admin'
import { getTodayJST } from '@/lib/utils'
import { StaffScheduleBoard } from '@/components/schedule/staff-schedule-board'
import type { CalendarEvent, ChildOption, FacilityDay } from '@/components/schedule/schedule-events-types'

export type StaffMember = {
  id: string
  name: string
  role: string | null
  user_id: string | null
}

export type StaffShift = {
  id: string
  staff_id: string
  shift_type: string
  start_time: string | null
  end_time: string | null
}

export type TransportAttendance = {
  id: string
  child_id: string
  children: { id: string; name: string } | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  daytime_support: boolean
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : getTodayJST()

  // 表示する月（カレンダー）の範囲
  const [yy, mm] = date.split('-').map(Number)
  const monthStart = `${yy}-${String(mm).padStart(2, '0')}-01`
  const lastDay = new Date(yy, mm, 0).getDate()
  const monthEnd = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const access = await getStaffAccess()
  const canEdit = access?.canEditOperations ?? false

  const [
    { data: staffMembersRaw },
    { data: shiftsRaw },
    { data: attendanceRaw },
    { data: vehiclesRaw },
  ] = await Promise.all([
    supabase.from('staff_members').select('id, name, role, user_id').order('name'),
    supabase.from('staff_shifts').select('id, staff_id, shift_type, start_time, end_time').eq('date', date),
    supabase
      .from('daily_attendance')
      .select(`
        id, child_id,
        pickup_driver_member_id, pickup_vehicle_id, pickup_departure_time, pickup_arrival_time,
        dropoff_driver_member_id, dropoff_vehicle_id, dropoff_departure_time, dropoff_arrival_time,
        daytime_support,
        daytime_pickup_driver_member_id, daytime_pickup_vehicle_id, daytime_pickup_departure_time, daytime_pickup_arrival_time,
        daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id, daytime_dropoff_departure_time, daytime_dropoff_arrival_time,
        children(id, name)
      `)
      .eq('date', date)
      .neq('status', 'absent'),
    supabase.from('transport_vehicles').select('id, name').order('name'),
  ])

  const [{ data: eventsRaw }, { data: facilityRaw }, { data: childrenRaw }] = await Promise.all([
    supabase
      .from('schedule_events')
      .select('id, title, event_type, event_date, start_time, end_time, all_day, location, note, child_id')
      .gte('event_date', monthStart)
      .lte('event_date', monthEnd)
      .order('event_date')
      .order('start_time', { nullsFirst: true }),
    supabase
      .from('facility_events')
      .select('event_date, event_type, title')
      .gte('event_date', monthStart)
      .lte('event_date', monthEnd),
    // 予定に付ける子（入力するシステム管理者のときだけ、見直し日つきで読む）
    canEdit
      ? supabase
          .from('children')
          .select('id, name, name_kana, support_plans(review_date, plan_date)')
          .eq('is_active', true)
          .order('name_kana')
      : Promise.resolve({ data: [] }),
  ])

  // 参加スタッフ・付いている子の表は、ブラウザ（ログイン中の人）からは読めない決まり（migration 175）なので
  // サーバーの鍵で、予定の ID だけを手がかりに読む
  type EventRow = Omit<CalendarEvent, 'staffUserIds' | 'childNames'> & { child_id: string | null }
  const eventRows = (eventsRaw ?? []) as unknown as EventRow[]
  const eventIds = eventRows.map((e) => e.id)
  const staffByEvent = new Map<string, string[]>()
  const childIdsByEvent = new Map<string, string[]>()
  if (eventIds.length > 0) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const [{ data: es }, { data: ec }] = await Promise.all([
      admin.from('schedule_event_staff').select('event_id, staff_id').in('event_id', eventIds),
      admin.from('schedule_event_children').select('event_id, child_id').in('event_id', eventIds),
    ])
    for (const r of (es ?? []) as { event_id: string; staff_id: string }[]) {
      staffByEvent.set(r.event_id, [...(staffByEvent.get(r.event_id) ?? []), r.staff_id])
    }
    for (const r of (ec ?? []) as { event_id: string; child_id: string }[]) {
      childIdsByEvent.set(r.event_id, [...(childIdsByEvent.get(r.event_id) ?? []), r.child_id])
    }
  }
  const allChildIds = Array.from(new Set([
    ...eventRows.map((e) => e.child_id).filter((v): v is string => !!v),
    ...Array.from(childIdsByEvent.values()).flat(),
  ]))
  const childNameById = new Map<string, string>()
  if (allChildIds.length > 0) {
    const { data: cn } = await supabase.from('children').select('id, name').in('id', allChildIds)
    for (const c of (cn ?? []) as { id: string; name: string }[]) childNameById.set(c.id, c.name)
  }
  const events: CalendarEvent[] = eventRows.map((e) => {
    const ids = e.child_id ? [e.child_id, ...(childIdsByEvent.get(e.id) ?? [])] : (childIdsByEvent.get(e.id) ?? [])
    return {
      ...e,
      childNames: Array.from(new Set(ids)).map((id) => childNameById.get(id)).filter((n): n is string => !!n),
      staffUserIds: staffByEvent.get(e.id) ?? [],
    }
  })

  const childOptions: ChildOption[] = ((childrenRaw ?? []) as {
    id: string
    name: string
    name_kana: string | null
    support_plans: { review_date: string | null; plan_date: string }[] | null
  }[]).map((c) => {
    // いちばん新しい計画の見直し日
    const latest = [...(c.support_plans ?? [])].sort((a, b) => b.plan_date.localeCompare(a.plan_date))[0]
    return { id: c.id, name: c.name, reviewDate: latest?.review_date ?? null }
  })

  // 辞めた人・使わない車は外す。その日の送迎・シフトに入っている人・車は残す（2026-11-17）
  const retired = await loadRetired(supabase)
  const usedTransport = transportIdsIn((attendanceRaw ?? []) as unknown[])
  const shiftStaffIds = ((shiftsRaw ?? []) as { staff_id: string | null }[]).map((s) => s.staff_id)

  return (
    <StaffScheduleBoard
      date={date}
      staffMembers={keepActive((staffMembersRaw ?? []) as StaffMember[], retired.staff, date, [...usedTransport.drivers, ...shiftStaffIds])}
      shifts={(shiftsRaw ?? []) as StaffShift[]}
      attendance={(attendanceRaw ?? []) as unknown as TransportAttendance[]}
      vehicles={keepActive((vehiclesRaw ?? []) as { id: string; name: string }[], retired.vehicles, date, usedTransport.vehicles)}
      events={events}
      facilityDays={(facilityRaw ?? []) as FacilityDay[]}
      childOptions={childOptions}
      // 参加スタッフに選べるのは、ログインできる（LINE のスケジュールで自分の予定がわかる）在籍のスタッフ
      staffOptions={keepActive((staffMembersRaw ?? []) as StaffMember[], retired.staff, date, [])
        .filter((s) => !!s.user_id)
        .map((s) => ({ userId: s.user_id!, name: s.name }))}
      canEdit={canEdit}
    />
  )
}
