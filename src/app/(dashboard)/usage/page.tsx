import { createClient } from '@/lib/supabase/server'
import { UsageCalendar, type UsageEntry } from '@/components/usage/usage-calendar'
import { buildUsageRoster, eachDate } from '@/lib/usage-roster'

type Unit = { id: string; name: string; capacity: number }
type Reservation = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  requested_by: string | null
  children: { name: string } | null
}
type PlanRow = {
  id: string
  child_id: string
  start_date: string
  end_date: string | null
  day_of_week: number[]
  children: { name: string } | null
}
type AttendanceRow = {
  child_id: string
  date: string
  status: string
  children: { name: string } | null
}
type ChildOption = { id: string; name: string }

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, capacity')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const [reservationsResult, childrenResult, attendanceResult, plansResult, overridesResult] =
    await Promise.all([
      selectedUnitId
        ? supabase
            .from('usage_reservations')
            .select('id, child_id, unit_id, date, status, requested_by, children(name)')
            .eq('unit_id', selectedUnitId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date')
        : Promise.resolve({ data: [] }),

      supabase
        .from('children')
        .select('id, name')
        .order('name'),

      // 出欠の記録（「欠席」ボタンの状態表示と、予約が無い利用日の把握に使う）
      selectedUnitId
        ? supabase
            .from('daily_attendance')
            .select('child_id, date, status, children(name)')
            .eq('unit_id', selectedUnitId)
            .gte('date', startDate)
            .lte('date', endDate)
        : Promise.resolve({ data: [] }),

      // 毎週の利用計画（予約が作られていない日をここから拾う）
      selectedUnitId
        ? supabase
            .from('usage_plans')
            .select('id, child_id, start_date, end_date, day_of_week, children(name)')
            .eq('unit_id', selectedUnitId)
            .eq('is_active', true)
            .lte('start_date', endDate)
            .or(`end_date.is.null,end_date.gte.${startDate}`)
        : Promise.resolve({ data: [] }),

      // 特定日のキャンセル
      supabase
        .from('usage_plan_date_overrides')
        .select('plan_id, date, is_cancelled')
        .gte('date', startDate)
        .lte('date', endDate),
    ])

  const reservations = (reservationsResult.data ?? []) as unknown as Reservation[]
  const childOptions = (childrenResult.data ?? []) as unknown as ChildOption[]
  const attendances = (attendanceResult.data ?? []) as unknown as AttendanceRow[]
  const plans = (plansResult.data ?? []) as unknown as PlanRow[]

  // `${childId}_${date}` → 'attended' | 'absent' | ...
  const attendanceStatusByKey = Object.fromEntries(
    attendances.map((a) => [`${a.child_id}_${a.date}`, a.status])
  )

  // その日の利用者は「予約・利用計画・出欠記録」から共通ロジックで決める。
  // 予約が無い利用日（計画にない曜日に来た日・出席カレンダーから足した日）も
  // ここに出るので、出席管理・ダッシュボードと人数が一致する。
  const childNameById = new Map<string, string>()
  for (const a of attendances) if (a.children) childNameById.set(a.child_id, a.children.name)
  for (const p of plans) if (p.children) childNameById.set(p.child_id, p.children.name)
  for (const r of reservations) if (r.children) childNameById.set(r.child_id, r.children.name)

  const roster = buildUsageRoster({
    dates: eachDate(startDate, endDate),
    reservations,
    plans,
    overrides: (overridesResult.data ?? []) as { plan_id: string; date: string; is_cancelled: boolean }[],
    attendances,
  })

  const entries: UsageEntry[] = []
  for (const [date, dayEntries] of roster) {
    for (const e of dayEntries) {
      const attendanceStatus = attendanceStatusByKey[`${e.childId}_${date}`] ?? null
      entries.push({
        id: e.reservation?.id ?? `roster-${e.childId}-${date}`,
        child_id: e.childId,
        unit_id: selectedUnitId,
        date,
        // 実際の記録がある日はそれを優先して表示する。
        // （予約をキャンセルしたあとに実際に来た日を「キャンセル」と見せないため）
        status:
          attendanceStatus === 'attended'
            ? 'attended'
            : attendanceStatus === 'absent'
            ? 'absent'
            : e.reservation?.status ?? 'plan',
        reservationId: e.reservation?.id ?? null,
        reservationStatus: e.reservation?.status ?? null,
        children: { name: childNameById.get(e.childId) ?? '—' },
        counts: e.counts,
      })
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.children!.name.localeCompare(b.children!.name, 'ja'))

  const confirmedCount = reservations.filter((r) => r.status === 'confirmed').length
  const reservedCount = reservations.filter((r) => r.status === 'reserved').length
  const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">利用状況</h1>
        <p className="text-sm text-gray-500 mt-0.5">予約・利用申し込みの確認・承認</p>
      </div>

      <UsageCalendar
        year={year}
        month={month}
        units={units}
        selectedUnitId={selectedUnitId}
        entries={entries}
        childOptions={childOptions}
        attendanceStatusByKey={attendanceStatusByKey}
        summary={{ confirmed: confirmedCount, reserved: reservedCount, cancelled: cancelledCount }}
      />
    </div>
  )
}
