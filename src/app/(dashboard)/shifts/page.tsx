import { getTodayJST } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { ShiftCalendar } from '@/components/shifts/shift-calendar'

type StaffUser = {
  id: string
  name: string
  employment_type: string | null
}

type ShiftEntry = {
  id: string
  staff_id: string
  date: string
  shift_type: string
  start_time: string | null
  end_time: string | null
  break_start_time: string | null
  break_end_time: string | null
  unit_id: string | null
  note: string | null
}

type Unit = {
  id: string
  name: string
}

type OvertimeRequest = {
  id: string
  staff_id: string
  date: string
  overtime_minutes: number
  status: string
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // スタッフ・シフト・ユニット・残業申請は互いに独立しているため並列取得
  const [
    { data: staffRaw },
    { data: shiftsRaw },
    { data: unitsRaw },
    { data: overtimeRaw },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, name')
      .in('role', ['admin', 'staff'])
      .order('name'),
    supabase
      .from('staff_shifts')
      .select('id, staff_id, date, shift_type, start_time, end_time, break_start_time, break_end_time, unit_id, note')
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('units')
      .select('id, name')
      .order('name'),
    supabase
      .from('overtime_requests')
      .select('id, staff_id, date, overtime_minutes, status')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('status', 'approved'),
  ])

  const staffList = (staffRaw ?? []).map((s) => ({ ...s, employment_type: null })) as StaffUser[]
  // スタッフが1人もいない場合はシフトを表示しない（従来どおり）
  const shifts = (staffList.length > 0 ? (shiftsRaw ?? []) : []) as unknown as ShiftEntry[]
  const units = (unitsRaw ?? []) as unknown as Unit[]
  const overtimeRequests = (overtimeRaw ?? []) as OvertimeRequest[]

  const today = getTodayJST()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`/shifts/actual?date=${today}`}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm text-gray-600"
        >
          <ClipboardCheck className="h-4 w-4 text-indigo-500" />
          出勤実績を入力
        </Link>
      </div>
      <ShiftCalendar
        year={year}
        month={month}
        staffList={staffList}
        shifts={shifts}
        units={units}
        overtimeRequests={overtimeRequests}
      />
    </div>
  )
}
