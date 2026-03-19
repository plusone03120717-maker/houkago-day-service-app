import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import type { Unit, Reservation, Attendance } from '@/components/attendance/attendance-board'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? formatDate(new Date(), 'yyyy-MM-dd')

  const { data: { user } } = await supabase.auth.getUser()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, capacity, facilities (id, name)')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const { data: reservationsRaw } = selectedUnitId
    ? await supabase
        .from('usage_reservations')
        .select('id, child_id, date, status, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
    : { data: [] }
  const reservations = (reservationsRaw ?? []) as unknown as Reservation[]

  const childIds = reservations.map((r) => r.child_id)
  const { data: attendancesRaw } = childIds.length > 0
    ? await supabase
        .from('daily_attendance')
        .select('*')
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .in('child_id', childIds)
    : { data: [] }
  const attendances = (attendancesRaw ?? []) as unknown as Attendance[]

  return (
    <AttendanceBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      reservations={reservations}
      attendances={attendances}
      staffId={user?.id ?? ''}
    />
  )
}
