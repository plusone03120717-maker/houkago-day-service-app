import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import type { Unit, Reservation, Attendance } from '@/components/attendance/attendance-board'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const today = params.date ?? formatDate(new Date(), 'yyyy-MM-dd')
  const todayDow = new Date(today).getDay()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type, capacity, facilities (id, name)')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const [{ data: reservationsRaw }, { data: plansRaw }] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('usage_reservations')
          .select('id, child_id, date, status, requested_by, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('date', today)
          .in('status', ['confirmed', 'reserved', 'cancel_waiting'])
      : { data: [] },

    // 有効な利用計画を取得（日付・曜日フィルタはJSで行う）
    selectedUnitId
      ? supabase
          .from('usage_plans')
          .select('id, child_id, start_date, end_date, day_of_week, children (id, name, name_kana, photo_url, allergy_info, medical_info)')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
      : { data: [] },
  ])

  type PlanRow = { id: string; child_id: string; start_date: string; end_date: string | null; day_of_week: number[]; children: Reservation['children'] }
  // 利用スケジュールページと同じロジックでJSフィルタ（Supabaseの or/contains が正常動作しない場合の対策）
  const planRows = ((plansRaw ?? []) as unknown as PlanRow[]).filter((p) => {
    if (p.start_date > today) return false
    if (p.end_date !== null && p.end_date < today) return false
    return (p.day_of_week ?? []).includes(todayDow)
  })

  // この日付でキャンセルされた計画IDを取得
  const planIds = planRows.map((p) => p.id)
  const { data: cancelledOverridesRaw } = planIds.length > 0
    ? await supabase
        .from('usage_plan_date_overrides')
        .select('plan_id')
        .in('plan_id', planIds)
        .eq('date', today)
        .eq('is_cancelled', true)
    : { data: [] }
  const cancelledPlanIds = new Set((cancelledOverridesRaw ?? []).map((o: { plan_id: string }) => o.plan_id))

  // 計画があるが全てキャンセルされている児童を特定
  const childHasPlan = new Set<string>(planRows.map((p) => p.child_id))
  const childHasValidPlan = new Set<string>(
    planRows.filter((p) => !cancelledPlanIds.has(p.id)).map((p) => p.child_id)
  )

  // 予約フィルタリング:
  // - 有効な計画あり → 常に表示
  // - 計画あるが全日付キャンセル → 除外
  // - 計画なし（削除・曜日変更・終了日変更済み）→ 保護者ポータルからの手動予約（requested_by!=null）のみ表示
  //   ※自動生成予約（requested_by=null）は計画がなければ除外することで同期ズレを防ぐ
  type ReservationWithMeta = Reservation & { requested_by: string | null }
  const reservations = ((reservationsRaw ?? []) as unknown as ReservationWithMeta[]).filter((r) => {
    if (childHasValidPlan.has(r.child_id)) return true
    if (childHasPlan.has(r.child_id)) return false
    return r.requested_by != null
  }) as unknown as Reservation[]

  // 予約に含まれていない利用計画の児童をマージ（キャンセル済みは除外）
  const reservedChildIds = new Set(reservations.map((r) => r.child_id))
  const planReservations: Reservation[] = planRows
    .filter((p) => !reservedChildIds.has(p.child_id) && !cancelledPlanIds.has(p.id))
    .map((p) => ({
      id: p.id,
      child_id: p.child_id,
      date: today,
      status: 'plan',
      children: p.children,
    }))
  const allReservations = [...reservations, ...planReservations]

  const childIds = allReservations.map((r) => r.child_id)
  const { data: attendancesRaw } = childIds.length > 0
    ? await supabase
        .from('daily_attendance')
        .select('*')
        .eq('unit_id', selectedUnitId)
        .eq('date', today)
        .in('child_id', childIds)
    : { data: [] }
  const attendances = (attendancesRaw ?? []) as unknown as Attendance[]

  return (
    <AttendanceBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      reservations={allReservations}
      attendances={attendances}
      staffId={user?.id ?? ''}
    />
  )
}
