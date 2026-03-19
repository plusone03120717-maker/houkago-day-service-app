import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActualAttendanceTable } from '@/components/shifts/actual-attendance-table'

type Staff = { id: string; name: string }

type ShiftEntry = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  actual_note: string | null
  is_attendance_confirmed: boolean
}

export default async function ActualAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const date = params.date ?? today

  const d = new Date(date)
  const prevDate = new Date(d)
  prevDate.setDate(prevDate.getDate() - 1)
  const nextDate = new Date(d)
  nextDate.setDate(nextDate.getDate() + 1)

  const supabase = await createClient()

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['admin', 'staff'])
    .order('name')
  const staffList = (staffRaw ?? []) as unknown as Staff[]

  const { data: shiftsRaw } = staffList.length > 0
    ? await supabase
        .from('staff_shifts')
        .select('id, staff_id, date, shift_type, start_time, end_time, actual_start_time, actual_end_time, actual_note, is_attendance_confirmed')
        .eq('date', date)
    : { data: [] }
  const shifts = (shiftsRaw ?? []) as unknown as ShiftEntry[]

  const confirmedCount = shifts.filter(
    (s) => s.is_attendance_confirmed && s.shift_type !== 'off' && s.shift_type !== 'holiday'
  ).length
  const workingCount = shifts.filter(
    (s) => s.shift_type !== 'off' && s.shift_type !== 'holiday'
  ).length

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/shifts" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">出勤実績</h1>
          <p className="text-sm text-gray-500 mt-0.5">実際の出退勤時間を記録します</p>
        </div>
        {workingCount > 0 && (
          <div className="text-sm text-gray-500">
            確認済: <span className="font-semibold text-green-600">{confirmedCount}</span>/{workingCount}人
          </div>
        )}
      </div>

      {/* 日付ナビ */}
      <div className="flex items-center gap-3">
        <Link
          href={`/shifts/actual?date=${prevDate.toISOString().slice(0, 10)}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold min-w-[120px] text-center">
          {d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </span>
        <Link
          href={`/shifts/actual?date=${nextDate.toISOString().slice(0, 10)}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        {date !== today && (
          <Link
            href="/shifts/actual"
            className="ml-2 text-xs text-indigo-600 hover:underline"
          >
            今日に戻る
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">出退勤記録</CardTitle>
        </CardHeader>
        <CardContent>
          {staffList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">スタッフが登録されていません</p>
          ) : (
            <ActualAttendanceTable
              date={date}
              staffList={staffList}
              shifts={shifts}
            />
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <p>• 「確認」チェックを押すと、その日の出勤実績を確認済みとしてマークします</p>
        <p>• シフト未登録のスタッフは灰色で表示されます。先にシフト管理からシフトを登録してください</p>
      </div>
    </div>
  )
}
