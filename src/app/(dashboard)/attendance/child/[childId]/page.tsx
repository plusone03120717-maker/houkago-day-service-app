import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, ClipboardList, BookOpen, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { SchoolHolidaySection } from '@/components/children/school-holiday-section'
import { AttendanceStatusToggle } from '@/components/attendance/attendance-status-toggle'
import { AttendanceTimeEditor } from '@/components/attendance/attendance-time-editor'
import { BackButton } from '@/components/ui/back-button'

function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default async function ChildAttendanceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { childId } = await params
  const sp = await searchParams

  const now = new Date()
  const selectedYear = sp.year ? parseInt(sp.year, 10) : now.getFullYear()
  const selectedMonth = sp.month ? parseInt(sp.month, 10) : now.getMonth() + 1

  const { start, end } = monthRange(selectedYear, selectedMonth)
  const prev = addMonths(selectedYear, selectedMonth, -1)
  const next = addMonths(selectedYear, selectedMonth, 1)

  const supabase = await createClient()

  const [
    { data: child },
    { data: attendancesRaw },
    { data: schoolHolidaysRaw },
    { data: nationalHolidaysRaw },
    { data: firstAttRaw },
  ] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('daily_attendance')
      .select('id, date, status, check_in_time, check_out_time, service_start_time, service_end_time, daytime_support, daytime_support_start_time, daytime_support_end_time, units(name)')
      .eq('child_id', childId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false }),
    supabase
      .from('child_school_holidays')
      .select('id, label, start_date, end_date')
      .eq('child_id', childId),
    supabase
      .from('facility_events')
      .select('event_date')
      .eq('event_type', 'holiday'),
    supabase
      .from('daily_attendance')
      .select('date')
      .eq('child_id', childId)
      .order('date', { ascending: true })
      .limit(1),
  ])

  if (!child) notFound()

  type AttendanceRow = {
    id: string
    date: string
    status: string
    check_in_time: string | null
    check_out_time: string | null
    service_start_time: string | null
    service_end_time: string | null
    daytime_support: boolean
    daytime_support_start_time: string | null
    daytime_support_end_time: string | null
    units: { name: string } | null
  }

  const attendances = (attendancesRaw ?? []) as unknown as AttendanceRow[]
  const schoolHolidays = (schoolHolidaysRaw ?? []) as { id: string; label: string; start_date: string; end_date: string }[]
  const nationalHolidayDates = new Set((nationalHolidaysRaw ?? []).map((h: { event_date: string }) => h.event_date))

  // 記録・連絡帳・活動記録の有無
  const attendanceIds = attendances.map((a) => a.id)
  type DailyRecordRow = { attendance_id: string; content: string; record_type: string }
  type ContactNoteRow = { date: string; content: string }
  type ActivityRow = { attendance_id: string; evaluation_notes: string | null; activity_programs: { name: string } | null }

  const [
    { data: recordsRaw },
    { data: notesRaw },
    { data: activitiesRaw },
  ] = attendanceIds.length > 0
    ? await Promise.all([
        supabase.from('daily_records').select('attendance_id, content, record_type').in('attendance_id', attendanceIds),
        supabase.from('contact_notes').select('date, content').eq('child_id', childId).gte('date', start).lte('date', end),
        supabase
          .from('daily_activities')
          .select('attendance_id, evaluation_notes, activity_programs(name)')
          .in('attendance_id', attendanceIds)
          .eq('participated', true)
          .not('program_id', 'is', null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const dailyRecords = (recordsRaw ?? []) as DailyRecordRow[]
  const contactNotes = (notesRaw ?? []) as ContactNoteRow[]
  const activities = (activitiesRaw ?? []) as unknown as ActivityRow[]

  // attendance_id → record lines
  const recordsMap: Record<string, string[]> = {}
  for (const r of dailyRecords) {
    if (!r.content?.trim()) continue
    if (!recordsMap[r.attendance_id]) recordsMap[r.attendance_id] = []
    const prefix = r.record_type === 'notable' ? '【特記】' : '【記録】'
    recordsMap[r.attendance_id].push(`${prefix}${r.content.trim()}`)
  }
  for (const a of activities) {
    const name = a.activity_programs?.name
    if (!name) continue
    if (!recordsMap[a.attendance_id]) recordsMap[a.attendance_id] = []
    const note = a.evaluation_notes?.trim()
    recordsMap[a.attendance_id].push(note ? `【活動】${name}（${note}）` : `【活動】${name}`)
  }

  // date → contact note content
  const notesMap: Record<string, string> = {}
  for (const n of contactNotes) {
    if (n.content?.trim()) notesMap[n.date] = n.content.trim()
  }

  const attendanceIdsWithRecords = new Set(Object.keys(recordsMap))
  const datesWithNotes = new Set(Object.keys(notesMap))
  const attendanceIdsWithActivities = new Set(activities.map((a) => a.attendance_id))

  // 最古の記録月を求めて「前月」ボタンの制限に使う
  const firstDate = firstAttRaw?.[0]?.date ?? start
  const firstYear = parseInt(firstDate.slice(0, 4))
  const firstMonth = parseInt(firstDate.slice(5, 7))
  const isEarliestMonth = selectedYear < firstYear || (selectedYear === firstYear && selectedMonth <= firstMonth)
  const isFutureMonth = selectedYear > now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth() + 1)

  const isSchoolHoliday = (date: string): string | null => {
    for (const h of schoolHolidays) {
      if (date >= h.start_date && date <= h.end_date) return h.label
    }
    return null
  }

  const totalAttended = attendances.filter((a) => a.status === 'attended').length
  const totalAbsent = attendances.filter((a) => a.status === 'absent').length

  const monthLabel = `${selectedYear}年${selectedMonth}月`

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <BackButton fallbackHref="/attendance" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">出席履歴</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
        {!isEarliestMonth ? (
          <Link
            replace
            href={`/attendance/child/${childId}?year=${prev.year}&month=${prev.month}`}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {prev.year}年{prev.month}月
          </Link>
        ) : (
          <div className="w-24" />
        )}

        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{monthLabel}</p>
          <p className="text-xs text-gray-400">出席 {totalAttended}日 / 欠席 {totalAbsent}日</p>
        </div>

        {!isFutureMonth ? (
          <Link
            replace
            href={`/attendance/child/${childId}?year=${next.year}&month=${next.month}`}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {next.year}年{next.month}月
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="w-24" />
        )}
      </div>

      {/* 学校休日 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            学校休日
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SchoolHolidaySection childId={childId} initial={schoolHolidays} />
        </CardContent>
      </Card>

      {/* 履歴一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">出席記録一覧（{monthLabel}）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {attendances.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">この月の出席記録はありません</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {attendances.map((att) => {
                const isNational = nationalHolidayDates.has(att.date)
                const schoolHolidayLabel = isSchoolHoliday(att.date)
                const rowBg = isNational ? 'bg-red-50' : schoolHolidayLabel ? 'bg-blue-50' : ''

                const rowRecords = recordsMap[att.id] ?? []
                const noteContent = notesMap[att.date]
                const hasContent = rowRecords.length > 0 || !!noteContent

                return (
                  <div key={att.id} className={`px-4 py-3 ${rowBg}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <Link
                            href={`/attendance/child/${childId}/${att.date}`}
                            className="text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline"
                          >
                            {formatDate(att.date)}
                          </Link>
                          <p className="text-xs text-gray-400">{att.units?.name}</p>
                        </div>
                        <div className="flex gap-1 flex-wrap items-center">
                          {isNational && (
                            <Badge variant="secondary" className="text-xs bg-red-50 text-red-600 border-red-200">祝日</Badge>
                          )}
                          {schoolHolidayLabel && (
                            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600 border-blue-200">{schoolHolidayLabel}</Badge>
                          )}
                          {attendanceIdsWithRecords.has(att.id) && (
                            <span title="日々の記録あり"><ClipboardList className="h-3.5 w-3.5 text-indigo-400" /></span>
                          )}
                          {datesWithNotes.has(att.date) && (
                            <span title="連絡帳あり"><BookOpen className="h-3.5 w-3.5 text-blue-400" /></span>
                          )}
                          {attendanceIdsWithActivities.has(att.id) && (
                            <span title="活動記録あり"><CheckSquare className="h-3.5 w-3.5 text-green-400" /></span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <AttendanceStatusToggle
                          attendanceId={att.id}
                          currentStatus={att.status}
                        />
                        <AttendanceTimeEditor
                          attendanceId={att.id}
                          serviceStartTime={att.service_start_time}
                          serviceEndTime={att.service_end_time}
                          daytimeSupport={att.daytime_support}
                          daytimeSupportStartTime={att.daytime_support_start_time}
                          daytimeSupportEndTime={att.daytime_support_end_time}
                        />
                      </div>
                    </div>
                    {hasContent && (
                      <div className="mt-2 space-y-1 pl-1">
                        {rowRecords.map((line, i) => (
                          <p key={i} className="text-xs text-gray-600 leading-relaxed">{line}</p>
                        ))}
                        {noteContent && (
                          <p className="text-xs text-blue-600 leading-relaxed">【連絡帳】{noteContent}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
