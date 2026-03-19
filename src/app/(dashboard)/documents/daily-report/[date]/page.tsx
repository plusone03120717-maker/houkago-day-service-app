import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DailyReportEditor } from '@/components/documents/daily-report-editor'

type ShiftEntry = {
  id: string
  staff_id: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  is_attendance_confirmed: boolean
  users: { name: string }
}

type AttendanceRecord = {
  child_id: string
  status: string
  children: { name: string; units: { name: string } | null }
}

type DailyReport = {
  id: string
  report_date: string
  manager_comment: string | null
  safety_check: boolean
  medication_records: string | null
  incident_notes: string | null
}

export default async function DailyReportDetailPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const supabase = await createClient()

  // シフト情報（スタッフ名付き）
  const { data: shiftsRaw } = await supabase
    .from('staff_shifts')
    .select('id, staff_id, shift_type, start_time, end_time, actual_start_time, actual_end_time, is_attendance_confirmed, users(name)')
    .eq('date', date)
    .neq('shift_type', 'off')
    .neq('shift_type', 'holiday')
  const shifts = (shiftsRaw ?? []) as unknown as ShiftEntry[]

  // 出席状況
  const { data: attendanceRaw } = await supabase
    .from('attendances')
    .select('child_id, status, children(name, units(name))')
    .eq('date', date)
  const attendances = (attendanceRaw ?? []) as unknown as AttendanceRecord[]

  const presentCount = attendances.filter((a) => a.status === 'present').length
  const absentCount = attendances.filter((a) => a.status === 'absent').length

  // 既存の日報
  const { data: reportRaw } = await supabase
    .from('daily_reports')
    .select('id, report_date, manager_comment, safety_check, medication_records, incident_notes')
    .eq('report_date', date)
    .limit(1)
    .single()
  const report = reportRaw as unknown as DailyReport | null

  const d = new Date(date)
  const dayLabel = d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ヘッダー（印刷時は非表示） */}
      <div className="flex items-center gap-3 print:hidden">
        <Link
          href="/documents/daily-report"
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">業務日報</h1>
          <p className="text-sm text-gray-500 mt-0.5">{dayLabel}</p>
        </div>
      </div>

      <DailyReportEditor
        date={date}
        dayLabel={dayLabel}
        shifts={shifts}
        presentCount={presentCount}
        absentCount={absentCount}
        attendances={attendances.map((a) => ({
          name: a.children.name,
          unit: a.children.units?.name ?? null,
          status: a.status,
        }))}
        initial={report}
      />
    </div>
  )
}
