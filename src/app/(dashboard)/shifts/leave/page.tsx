import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { PaidLeaveBoard } from '@/components/shifts/paid-leave-board'
import type { StaffUser, LeaveGrant, LeaveUsage } from '@/components/shifts/paid-leave-board'

function currentYear(): number {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // 年度: 4月始まり（1〜3月は前年度）
  const m = jst.getUTCMonth() + 1
  const y = jst.getUTCFullYear()
  return m >= 4 ? y : y - 1
}

export default async function PaidLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()

  const year = params.year ? parseInt(params.year) : currentYear()

  // スタッフ一覧（staff_members.id を使用）
  const { data: staffRaw } = await supabase
    .from('staff_members')
    .select('id, name')
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
  const usageStart = `${year}-04-01`
  const usageEnd = `${year + 1}-03-31`
  const { data: usagesRaw } = staffIds.length > 0
    ? await supabase
        .from('paid_leave_usages')
        .select('id, staff_id, date, days_used, note')
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
        <p className="text-sm text-gray-500 mt-0.5">年度別の有給付与・使用記録を管理します（システム管理者専用）</p>
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
