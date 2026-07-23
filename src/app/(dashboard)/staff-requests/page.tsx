import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { StaffRequestsBoard } from '@/components/staff-requests/staff-requests-board'
import type { OvertimeRequest, LeaveUsage, BreakRecord } from '@/components/staff-requests/staff-requests-board'

export default async function StaffRequestsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [overtimeRes, leaveRes, breakRes] = await Promise.all([
    supabase
      .from('overtime_requests')
      .select('id, date, actual_end_time, status, staff_members(name)')
      .eq('status', 'pending')
      .order('date', { ascending: false }),
    supabase
      .from('paid_leave_usages')
      .select('id, date, days_used, staff_members(name)')
      .eq('is_new', true)
      .order('date', { ascending: false }),
    supabase
      .from('time_records')
      .select('id, recorded_at, staff_members(name)')
      .eq('type', 'break_start')
      .eq('is_new', true)
      .order('recorded_at', { ascending: false }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">スタッフ申請</h1>
        <p className="text-sm text-gray-500 mt-0.5">LINEから申請された残業・有給・中抜けを確認します</p>
      </div>
      <StaffRequestsBoard
        overtimeRequests={(overtimeRes.data ?? []) as unknown as OvertimeRequest[]}
        leaveUsages={(leaveRes.data ?? []) as unknown as LeaveUsage[]}
        breakRecords={(breakRes.data ?? []) as unknown as BreakRecord[]}
      />
    </div>
  )
}
