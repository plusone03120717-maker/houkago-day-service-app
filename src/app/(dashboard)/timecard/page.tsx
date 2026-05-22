import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { TimecardBoard } from '@/components/timecard/timecard-board'
import type { StaffMember, TimeRecord } from '@/components/timecard/timecard-board'

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

  // スタッフ一覧と時給を取得
  const { data: membersRaw } = await supabase
    .from('staff_members')
    .select('id, name')
    .order('name')

  const members = (membersRaw ?? []) as { id: string; name: string }[]
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
    hourly_rate: rateMap.get(m.id)?.hourly_rate ?? null,
    hourly_rate_id: rateMap.get(m.id)?.id ?? null,
  }))

  const selectedStaffId = params.staff ?? staffMembers[0]?.id ?? ''

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">タイムカード</h1>
        <p className="text-sm text-gray-500 mt-0.5">LINEによる打刻履歴・給与計算</p>
      </div>

      <TimecardBoard
        staffMembers={staffMembers}
        initialRecords={records}
        initialMonth={month}
        staffId={selectedStaffId}
      />
    </div>
  )
}
