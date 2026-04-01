import { createClient } from '@/lib/supabase/server'
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

  const { data: child } = await supabase
    .from('children')
    .select('id, name, name_kana, photo_url, allergy_info, medical_info, disability_type')
    .eq('id', childId)
    .single()

  if (!child) notFound()

  const { data: attendance } = await supabase
    .from('daily_attendance')
    .select('*')
    .eq('child_id', childId)
    .eq('unit_id', unit)
    .eq('date', date)
    .single()

  // 既存の記録を取得
  const { data: dailyRecords } = attendance
    ? await supabase
        .from('daily_records')
        .select('*, record_attachments(*)')
        .eq('attendance_id', attendance.id)
        .order('created_at')
    : { data: [] }

  // 活動プログラム一覧
  const { data: programs } = await supabase
    .from('activity_programs')
    .select('id, name, category')
    .order('category, name')

  // 活動記録を取得
  const { data: activities } = attendance
    ? await supabase
        .from('daily_activities')
        .select('*, activity_programs(id, name, category)')
        .eq('attendance_id', attendance.id)
    : { data: [] }

  // 連絡帳の既存データ
  const { data: contactNote } = await supabase
    .from('contact_notes')
    .select('*')
    .eq('child_id', childId)
    .eq('date', date)
    .eq('unit_id', unit)
    .single()

  // 服薬情報（有効なもの）
  const { data: medicationsRaw } = await supabase
    .from('child_medications')
    .select('id, medication_name, dosage, timing, is_active')
    .eq('child_id', childId)
    .order('medication_name')
  const medications = (medicationsRaw ?? []).filter((m) => m.is_active)

  // 本日の与薬ログ
  const { data: medicationLogs } = await supabase
    .from('medication_logs')
    .select('id, medication_id, log_date, status, notes, administered_at')
    .eq('child_id', childId)
    .eq('log_date', date)

  // 学校休日チェック（この日が子どもの学校休日か）
  const { data: schoolHolidaysRaw } = await supabase
    .from('child_school_holidays')
    .select('start_date, end_date')
    .eq('child_id', childId)
  const isSchoolHoliday = (schoolHolidaysRaw ?? []).some(
    (h: { start_date: string; end_date: string }) => date >= h.start_date && date <= h.end_date
  )

  // 施設の提供時間デフォルト設定を取得
  const { data: facilityRaw } = await supabase
    .from('facilities')
    .select('id')
    .limit(1)
    .single()
  const { data: notifSettings } = facilityRaw
    ? await supabase
        .from('notification_settings')
        .select('default_service_end_time, holiday_service_end_time')
        .eq('facility_id', facilityRaw.id)
        .limit(1)
        .single()
    : { data: null }

  const defaultServiceEndTime = (notifSettings?.default_service_end_time as string | null)?.slice(0, 5) ?? '16:30'
  const holidayServiceEndTime = (notifSettings?.holiday_service_end_time as string | null)?.slice(0, 5) ?? '16:00'

  const { data: { user } } = await supabase.auth.getUser()

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
      staffId={user?.id ?? ''}
      medications={medications ?? []}
      medicationLogs={medicationLogs ?? []}
      isSchoolHoliday={isSchoolHoliday}
      defaultServiceEndTime={defaultServiceEndTime}
      holidayServiceEndTime={holidayServiceEndTime}
    />
  )
}
