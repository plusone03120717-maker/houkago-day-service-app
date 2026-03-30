import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

export default async function ChildAttendanceHistoryPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const [
    { data: child },
    { data: attendancesRaw },
    { data: schoolHolidaysRaw },
    { data: nationalHolidaysRaw },
  ] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('daily_attendance')
      .select('id, date, status, check_in_time, check_out_time, units(name)')
      .eq('child_id', childId)
      .order('date', { ascending: false }),
    supabase
      .from('child_school_holidays')
      .select('label, start_date, end_date')
      .eq('child_id', childId),
    supabase
      .from('facility_events')
      .select('event_date, title')
      .eq('event_type', 'holiday'),
  ])

  if (!child) notFound()

  type AttendanceRow = {
    id: string
    date: string
    status: string
    check_in_time: string | null
    check_out_time: string | null
    units: { name: string } | null
  }

  const attendances = (attendancesRaw ?? []) as unknown as AttendanceRow[]
  const schoolHolidays = (schoolHolidaysRaw ?? []) as { label: string; start_date: string; end_date: string }[]
  const nationalHolidayDates = new Set((nationalHolidaysRaw ?? []).map((h: { event_date: string }) => h.event_date))

  const isSchoolHoliday = (date: string): string | null => {
    for (const h of schoolHolidays) {
      if (date >= h.start_date && date <= h.end_date) return h.label
    }
    return null
  }

  const totalAttended = attendances.filter((a) => a.status === 'attended').length
  const totalAbsent = attendances.filter((a) => a.status === 'absent').length

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/attendance" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">出席履歴</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 集計 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{totalAttended}</div>
            <div className="text-xs text-gray-500 mt-1">出席日数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{totalAbsent}</div>
            <div className="text-xs text-gray-500 mt-1">欠席日数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">{attendances.length}</div>
            <div className="text-xs text-gray-500 mt-1">記録件数</div>
          </CardContent>
        </Card>
      </div>

      {/* 履歴一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">出席記録一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {attendances.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">出席記録がありません</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {attendances.map((att) => {
                const isNational = nationalHolidayDates.has(att.date)
                const schoolHolidayLabel = isSchoolHoliday(att.date)

                return (
                  <div key={att.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{formatDate(att.date)}</p>
                        <p className="text-xs text-gray-400">{att.units?.name}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {isNational && (
                          <Badge variant="secondary" className="text-xs bg-red-50 text-red-600 border-red-200">
                            祝日
                          </Badge>
                        )}
                        {schoolHolidayLabel && (
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                            {schoolHolidayLabel}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {att.check_in_time && att.check_out_time && (
                        <span className="text-xs text-gray-500">
                          {att.check_in_time.slice(0, 5)} 〜 {att.check_out_time.slice(0, 5)}
                        </span>
                      )}
                      <Badge
                        variant={att.status === 'attended' ? 'success' : 'secondary'}
                        className="text-xs"
                      >
                        {att.status === 'attended' ? '出席' : att.status === 'absent' ? '欠席' : 'その他'}
                      </Badge>
                    </div>
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
