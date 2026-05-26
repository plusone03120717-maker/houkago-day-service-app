import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { TimecardBoard } from '@/components/timecard/timecard-board'
import type { StaffMember, TimeRecord, ShiftEntry, OvertimeRequest } from '@/components/timecard/timecard-board'

function currentMonth(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 7)
}

export default async function TimecardPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; month?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()

  const month = params.month ?? currentMonth()
  const [y, m] = month.split('-').map(Number)
  const recordsStart = new Date(y, m - 1, 1).toISOString()
  const recordsEnd = new Date(y, m, 1).toISOString()
  const rateMonthStart = `${month}-01`
  const rateMonthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

  // スタッフ一覧（user_id 含む）
  const { data: membersRaw } = await supabase
    .from('staff_members')
    .select('id, name, user_id')
    .order('name')
  type MemberRow = { id: string; name: string; user_id: string | null }
  const members = (membersRaw ?? []) as MemberRow[]
  const memberIds = members.map((m) => m.id)

  // 選択月に有効な時給を取得
  const { data: ratesRaw } = memberIds.length > 0
    ? await supabase
        .from('staff_hourly_rates')
        .select('id, staff_member_id, hourly_rate, effective_from, effective_to')
        .in('staff_member_id', memberIds)
        .lte('effective_from', rateMonthEnd)
        .or(`effective_to.is.null,effective_to.gte.${rateMonthStart}`)
        .order('effective_from', { ascending: true })
    : { data: [] }

  type RateRow = { id: string; staff_member_id: string; hourly_rate: number }
  const rateMap = new Map<string, { id: string; hourly_rate: number }>()
  for (const r of (ratesRaw ?? []) as RateRow[]) {
    rateMap.set(r.staff_member_id, { id: r.id, hourly_rate: r.hourly_rate })
  }

  const staffMembers: StaffMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    user_id: m.user_id,
    hourly_rate: rateMap.get(m.id)?.hourly_rate ?? null,
    hourly_rate_id: rateMap.get(m.id)?.id ?? null,
  }))

  const selectedStaffId = params.staff ?? staffMembers[0]?.id ?? ''
  const selectedMember = staffMembers.find((s) => s.id === selectedStaffId)

  // 選択スタッフの当月打刻を取得
  const { data: recordsRaw } = selectedStaffId
    ? await supabase
        .from('time_records')
        .select('id, staff_member_id, type, recorded_at, note, edited_at')
        .eq('staff_member_id', selectedStaffId)
        .gte('recorded_at', recordsStart)
        .lt('recorded_at', recordsEnd)
        .order('recorded_at')
    : { data: [] }
  const records = (recordsRaw ?? []) as TimeRecord[]

  // 選択スタッフの当月シフト（user_id 経由）
  const userId = selectedMember?.user_id ?? null
  const { data: shiftsRaw } = userId
    ? await supabase
        .from('staff_shifts')
        .select('id, date, shift_type, start_time, end_time')
        .eq('staff_id', userId)
        .gte('date', rateMonthStart)
        .lte('date', rateMonthEnd)
    : { data: [] }
  const shifts = (shiftsRaw ?? []) as ShiftEntry[]

  // 選択スタッフの当月残業申請
  const { data: overtimeRaw } = userId
    ? await supabase
        .from('overtime_requests')
        .select('id, date, scheduled_end_time, actual_end_time, overtime_minutes, request_type, status, note')
        .eq('staff_id', userId)
        .gte('date', rateMonthStart)
        .lte('date', rateMonthEnd)
    : { data: [] }
  const overtimeRequests = (overtimeRaw ?? []) as OvertimeRequest[]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">タイムカード</h1>
        <p className="text-sm text-gray-500 mt-0.5">LINEによる打刻履歴・給与計算・残業管理</p>
      </div>

      <TimecardBoard
        staffMembers={staffMembers}
        initialRecords={records}
        initialMonth={month}
        staffId={selectedStaffId}
        initialShifts={shifts}
        initialOvertimeRequests={overtimeRequests}
      />
    </div>
  )
}
