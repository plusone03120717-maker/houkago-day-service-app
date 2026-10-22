import { createClient } from '@/lib/supabase/server'
import { requireMoneyAccess } from '@/lib/require-admin'
import { StaffRequestsBoard } from '@/components/staff-requests/staff-requests-board'
import type { OvertimeRequest, LeaveUsage, BreakRecord } from '@/components/staff-requests/staff-requests-board'
import { toJSTDate } from '@/lib/work-time'

export default async function StaffRequestsPage() {
  await requireMoneyAccess()
  const supabase = await createClient()

  const [overtimeRes, leaveRes, breakRes] = await Promise.all([
    supabase
      .from('overtime_requests')
      .select('id, date, actual_end_time, overtime_minutes, status, staff_members(name)')
      .eq('is_new', true)
      .order('date', { ascending: false }),
    supabase
      .from('paid_leave_usages')
      .select('id, date, unit, days_used, hours_used, staff_members(name)')
      .eq('is_new', true)
      .order('date', { ascending: false }),
    supabase
      .from('time_records')
      .select('id, staff_member_id, recorded_at, staff_members(name)')
      .eq('type', 'break_start')
      .eq('is_new', true)
      .order('recorded_at', { ascending: false }),
  ])

  // 中抜けの終了時刻を添える（同じスタッフ・同じ日で、開始より後の最初の break_end）
  type BreakStartRow = Omit<BreakRecord, 'end_at'> & { staff_member_id: string }
  const breakStarts = (breakRes.data ?? []) as unknown as BreakStartRow[]
  let breakRecords: BreakRecord[] = []
  if (breakStarts.length > 0) {
    const times = breakStarts.map((b) => b.recorded_at).sort()
    const { data: endRaw } = await supabase
      .from('time_records')
      .select('staff_member_id, recorded_at')
      .eq('type', 'break_end')
      .in('staff_member_id', Array.from(new Set(breakStarts.map((b) => b.staff_member_id))))
      .gte('recorded_at', times[0])
      .lte('recorded_at', new Date(new Date(times[times.length - 1]).getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at')
    const ends = (endRaw ?? []) as { staff_member_id: string; recorded_at: string }[]
    breakRecords = breakStarts.map((b) => {
      const end = ends.find((e) =>
        e.staff_member_id === b.staff_member_id
        && e.recorded_at > b.recorded_at
        && toJSTDate(e.recorded_at) === toJSTDate(b.recorded_at),
      )
      return { id: b.id, recorded_at: b.recorded_at, end_at: end?.recorded_at ?? null, staff_members: b.staff_members }
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">スタッフ申請</h1>
        <p className="text-sm text-gray-500 mt-0.5">LINEから申請された残業・有給・中抜けを確認します</p>
      </div>
      <StaffRequestsBoard
        overtimeRequests={(overtimeRes.data ?? []) as unknown as OvertimeRequest[]}
        leaveUsages={(leaveRes.data ?? []) as unknown as LeaveUsage[]}
        breakRecords={breakRecords}
      />
    </div>
  )
}
