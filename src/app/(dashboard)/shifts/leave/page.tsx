import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { PaidLeaveBoard } from '@/components/shifts/paid-leave-board'
import type { StaffUser, LeaveGrant, LeaveUsage } from '@/components/shifts/paid-leave-board'
import { currentFiscalYear, fiscalYearRange } from '@/lib/paid-leave'

export default async function PaidLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()

  const year = params.year ? parseInt(params.year) : currentFiscalYear()

  // スタッフ一覧（staff_members.id を使用）
  const { data: staffRaw } = await supabase
    .from('staff_members')
    .select('id, name, paid_leave_hours_per_day')
    .order('name')
  const staffList = (staffRaw ?? []) as StaffUser[]
  const staffIds = staffList.map((s) => s.id)

  // 付与日数（指定年度）
  const { data: grantsRaw } = staffIds.length > 0
    ? await supabase
        .from('paid_leave_grants')
        .select('id, staff_id, year, total_days, note')
        .in('staff_id', staffIds)
        .eq('year', year)
    : { data: [] }
  const grants = (grantsRaw ?? []) as LeaveGrant[]

  // 使用記録（指定年度: 4/1〜翌3/31）
  const { start: usageStart, end: usageEnd } = fiscalYearRange(year)
  const { data: usagesRaw } = staffIds.length > 0
    ? await supabase
        .from('paid_leave_usages')
        .select('id, staff_id, date, unit, days_used, hours_used, note')
        .in('staff_id', staffIds)
        .gte('date', usageStart)
        .lte('date', usageEnd)
        .order('date')
    : { data: [] }
  const usages = (usagesRaw ?? []) as LeaveUsage[]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">有給管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          年度別の有給付与・使用記録を管理します（システム管理者専用）。1日・半日に加えて、労使協定に基づく時間単位（年5日分まで）に対応しています。
        </p>
      </div>

      <PaidLeaveBoard
        staffList={staffList}
        initialGrants={grants}
        initialUsages={usages}
        initialYear={year}
      />
    </div>
  )
}
