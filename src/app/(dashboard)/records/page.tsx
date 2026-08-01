import { createClient } from '@/lib/supabase/server'
import { getTodayJST } from '@/lib/utils'
import { RecordsListBoard } from '@/components/records/records-list-board'

type AttendedChild = {
  id: string
  child_id: string
  unit_id: string
  status: string
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

type DailyRecord = {
  id: string
  attendance_id: string
  has_notable_flag: boolean
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const targetDate = params.date ?? getTodayJST()

  const [
    { data: attendedRaw },
    { data: staffMembersRaw },
    { data: vehiclesRaw },
    { data: facilityRaw },
  ] = await Promise.all([
    supabase
      .from('daily_attendance')
      .select(`
        id, child_id, unit_id, status, basic_service,
        service_start_time, service_end_time,
        daytime_support, daytime_support_start_time, daytime_support_end_time,
        pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
        dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
        daytime_pickup_departure_time, daytime_pickup_arrival_time, daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
        daytime_dropoff_departure_time, daytime_dropoff_arrival_time, daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id,
        children(id, name, name_kana), units(id, name)
      `)
      .eq('date', targetDate)
      .in('status', ['attended', 'absent'])
      .order('created_at'),
    supabase.from('staff_members').select('id, name').order('name'),
    supabase.from('transport_vehicles').select('id, name').order('name'),
    supabase.from('facilities').select('id').limit(1).single(),
  ])

  const attended = (attendedRaw ?? []) as unknown as AttendedChild[]

  // 既存の記録
  const attendanceIds = attended.map((a) => a.id)
  const { data: recordsRaw } = attendanceIds.length > 0
    ? await supabase
        .from('daily_records')
        .select('id, attendance_id, has_notable_flag')
        .in('attendance_id', attendanceIds)
    : { data: [] }
  const records = (recordsRaw ?? []) as unknown as DailyRecord[]
  const recordByAttendanceId = Object.fromEntries(records.map((r) => [r.attendance_id, r]))

  // デフォルト終了時間
  const { data: notifSettings } = facilityRaw
    ? await supabase
        .from('notification_settings')
        .select('default_service_end_time')
        .eq('facility_id', facilityRaw.id)
        .limit(1)
        .single()
    : { data: null }
  const defaultServiceEndTime = (notifSettings?.default_service_end_time as string | null)?.slice(0, 5) ?? '16:30'

  // ユニットでグループ
  const byUnit: Record<string, { unitName: string; items: AttendedChild[] }> = {}
  attended.forEach((a) => {
    const unitId = a.unit_id
    const unitName = a.units?.name ?? 'ユニット不明'
    if (!byUnit[unitId]) byUnit[unitId] = { unitName, items: [] }
    byUnit[unitId].items.push(a)
  })

  // 前後日
  const d = new Date(targetDate)
  const prevDate = new Date(d)
  prevDate.setDate(d.getDate() - 1)
  const nextDate = new Date(d)
  nextDate.setDate(d.getDate() + 1)

  const writtenCount = records.length
  const totalCount = attended.filter((a) => a.status === 'attended').length

  return (
    <RecordsListBoard
      targetDate={targetDate}
      prevDate={prevDate.toISOString().slice(0, 10)}
      nextDate={nextDate.toISOString().slice(0, 10)}
      byUnit={byUnit}
      staffMembers={(staffMembersRaw ?? []) as { id: string; name: string }[]}
      vehicles={(vehiclesRaw ?? []) as { id: string; name: string }[]}
      recordByAttendanceId={recordByAttendanceId}
      writtenCount={writtenCount}
      totalCount={totalCount}
      defaultServiceEndTime={defaultServiceEndTime}
    />
  )
}
