import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { formatDate } from '@/lib/utils'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import type { Unit, Reservation, Attendance } from '@/components/attendance/attendance-board'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? formatDate(new Date(), 'yyyy-MM-dd')
  const todayDow = new Date(today).getDay()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, capacity, facilities (id, name)')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const [{ data: reservationsRaw }, { data: plansRaw }] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('usage_reservations')
          .select('id, child_id, date, status, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
          .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
      : { data: [] },

    // 有効な利用計画から今日の曜日に該当する児童
    selectedUnitId
      ? supabase
          .from('usage_plans')
          .select('id, child_id, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
          .lte('start_date', today)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .contains('day_of_week', [todayDow])
      : { data: [] },
  ])

  const reservations = (reservationsRaw ?? []) as unknown as Reservation[]

  // 予約に含まれていない利用計画の児童をマージ
  const reservedChildIds = new Set(reservations.map((r) => r.child_id))
  type PlanRow = { id: string; child_id: string; children: Reservation['children'] }
  const planRows = (plansRaw ?? []) as unknown as PlanRow[]
  const planReservations: Reservation[] = planRows
    .filter((p) => !reservedChildIds.has(p.child_id))
    .map((p) => ({
      id: p.id,
      child_id: p.child_id,
      date: today,
      status: 'plan',
      children: p.children,
    }))
  const allReservations = [...reservations, ...planReservations]

  const childIds = allReservations.map((r) => r.child_id)
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
      reservations={allReservations}
      attendances={attendances}
      staffId={user?.id ?? ''}
    />
  )
}
