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
  unit_id: string | null
  note: string | null
}

type Unit = {
  id: string
  name: string
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

  const { data: staffRaw } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['admin', 'staff'])
    .order('name')
  const staffList = (staffRaw ?? []).map((s) => ({ ...s, employment_type: null })) as StaffUser[]

  const { data: shiftsRaw } = staffList.length > 0
    ? await supabase
        .from('staff_shifts')
        .select('id, staff_id, date, shift_type, start_time, end_time, unit_id, note')
        .gte('date', startDate)
        .lte('date', endDate)
    : { data: [] }
  const shifts = (shiftsRaw ?? []) as unknown as ShiftEntry[]

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const today = new Date().toISOString().slice(0, 10)

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
      />
    </div>
  )
}
