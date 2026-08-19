import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { DailyRecordForm } from '@/components/records/daily-record-form'

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const { childId } = await params
  const { date, unit } = await searchParams
  const supabase = await createClient()

  if (!date || !unit) notFound()

  // 第1波: attendance の結果に依存しないクエリをすべて並列実行
  const [
    { data: child },
    { data: attendance },
    { data: programs },
    { data: contactNote },
    { data: medicationsRaw },
    { data: medicationLogs },
    { data: schoolHolidaysRaw },
    { data: facilityRaw },
    userId,
  ] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, photo_url, allergy_info, medical_info, disability_type')
      .eq('id', childId)
      .single(),
    supabase
      .from('daily_attendance')
      .select('id, check_in_time, check_out_time, pickup_type, service_start_time, service_end_time, basic_service, daytime_support, daytime_support_start_time, daytime_support_end_time')
      .eq('child_id', childId)
      .eq('unit_id', unit)
      .eq('date', date)
      .single(),
    supabase.from('activity_programs').select('id, name, category').order('category, name'),
    supabase.from('contact_notes').select('*').eq('child_id', childId).eq('date', date).eq('unit_id', unit).single(),
    supabase.from('child_medications').select('id, medication_name, dosage, timing, is_active').eq('child_id', childId).order('medication_name'),
    supabase.from('medication_logs').select('id, medication_id, log_date, status, notes, administered_at').eq('child_id', childId).eq('log_date', date),
    supabase.from('child_school_holidays').select('start_date, end_date').eq('child_id', childId),
    supabase.from('facilities').select('id').limit(1).single(),
    getSessionUserId(),
  ])

  if (!child) notFound()

  // 第2波: attendance / facility の結果に依存するクエリを並列実行
  const [{ data: dailyRecords }, { data: activities }, { data: notifSettings }] = await Promise.all([
    attendance
      ? supabase.from('daily_records').select('*, record_attachments(*)').eq('attendance_id', attendance.id).order('created_at')
      : Promise.resolve({ data: [] }),
    attendance
      ? supabase.from('daily_activities').select('*, activity_programs(id, name, category)').eq('attendance_id', attendance.id)
      : Promise.resolve({ data: [] }),
    facilityRaw
      ? supabase
          .from('notification_settings')
          .select('default_service_end_time, holiday_service_end_time')
          .eq('facility_id', facilityRaw.id)
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const medications = (medicationsRaw ?? []).filter((m) => m.is_active)

  const isSchoolHoliday = (schoolHolidaysRaw ?? []).some(
    (h: { start_date: string; end_date: string }) => date >= h.start_date && date <= h.end_date
  )

  const defaultServiceEndTime = (notifSettings?.default_service_end_time as string | null)?.slice(0, 5) ?? '16:30'
  const holidayServiceEndTime = (notifSettings?.holiday_service_end_time as string | null)?.slice(0, 5) ?? '16:00'

  return (
    <DailyRecordForm
      child={child}
      attendance={attendance ?? null}
      date={date}
      unitId={unit}
      dailyRecords={dailyRecords ?? []}
      activities={activities ?? []}
      programs={programs ?? []}
      contactNote={contactNote ?? null}
      staffId={userId ?? ''}
      medications={medications ?? []}
      medicationLogs={medicationLogs ?? []}
      isSchoolHoliday={isSchoolHoliday}
      defaultServiceEndTime={defaultServiceEndTime}
      holidayServiceEndTime={holidayServiceEndTime}
    />
  )
}
