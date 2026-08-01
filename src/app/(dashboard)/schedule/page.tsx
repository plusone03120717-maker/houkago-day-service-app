export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { StaffScheduleBoard } from '@/components/schedule/staff-schedule-board'

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

  const date = params.date ?? getTodayJST()

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

  return (
    <StaffScheduleBoard
      date={date}
      staffMembers={(staffMembersRaw ?? []) as StaffMember[]}
      shifts={(shiftsRaw ?? []) as StaffShift[]}
      attendance={(attendanceRaw ?? []) as unknown as TransportAttendance[]}
      vehicles={(vehiclesRaw ?? []) as { id: string; name: string }[]}
    />
  )
}
