import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import { getTodayJST } from '@/lib/utils'
import { loadAttendanceBoardData } from '@/lib/attendance-board-data'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import type { Unit, Reservation, Attendance, PrevAttendanceRow } from '@/components/attendance/attendance-board'
import type { ScheduleDefaults } from '@/components/transport/transport-daytime-panel'

/** 送迎・時間系の入力が一つでも入っている行か */
function hasAnyTransportInput(r: PrevAttendanceRow): boolean {
  const t = (v: string | null) => !!v && v.slice(0, 5) !== '00:00'
  return (
    t(r.service_start_time) || t(r.pickup_departure_time) || t(r.pickup_arrival_time) ||
    t(r.dropoff_departure_time) || t(r.dropoff_arrival_time) ||
    !!r.pickup_driver_member_id || !!r.dropoff_driver_member_id ||
    r.daytime_support
  )
}

type ChildInfo = {
  id: string
  name: string
  name_kana: string | null
  photo_url: string | null
  allergy_info: string | null
  medical_info: string | null
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const today = params.date ?? getTodayJST()
  const todayDow = new Date(today).getDay()
  const supabase = await createClient()

  // データ取得は1回にまとめてある（Postgres 関数 get_attendance_board）。
  // 依存関係のあるクエリ（plan_id → 曜日別設定、child_id → 前回コピー用）も
  // DB内で解決されるため、以前のような4段のウォーターフォールは発生しない。
  // 予約・計画・キャンセルのマージ判定は従来どおりここで行う。
  const [userId, data] = await Promise.all([
    getSessionUserId(),
    loadAttendanceBoardData(supabase, params.unit, today),
  ])

  const units = data.units as unknown as Unit[]
  const selectedUnitId = data.selectedUnitId
  const attendances = data.attendances as unknown as Attendance[]

  type PlanRow = {
    id: string
    child_id: string
    start_date: string
    end_date: string | null
    day_of_week: number[]
    transport_type: string
    pickup_time: string | null
    dropoff_time: string | null
    service_start_time: string | null
    service_end_time: string | null
    daytime_support: boolean
    daytime_support_start_time: string | null
    daytime_support_end_time: string | null
    children: Reservation['children']
  }
  const planRows = (data.plans as unknown as PlanRow[]).filter((p) => {
    if (p.start_date > today) return false
    if (p.end_date !== null && p.end_date < today) return false
    return (p.day_of_week ?? []).includes(todayDow)
  })

  // ── 送迎・日中一時入力の初期値: 特定日上書き > 曜日別設定 > プランのデフォルト ──
  type DaySettingRow = {
    plan_id: string
    transport_type: string | null
    pickup_time: string | null
    dropoff_time: string | null
    service_start_time: string | null
    service_end_time: string | null
  }
  type DateOverrideRow = DaySettingRow & { date: string; is_cancelled: boolean }

  const overrideRows = data.overrides as unknown as DateOverrideRow[]

  // この日付でキャンセルされた計画ID
  const cancelledPlanIds = new Set(overrideRows.filter((o) => o.is_cancelled).map((o) => o.plan_id))

  // 計画があるが全てキャンセルされている児童を特定
  const childHasValidPlan = new Set<string>(
    planRows.filter((p) => !cancelledPlanIds.has(p.id)).map((p) => p.child_id)
  )

  const daySettingByPlanId = Object.fromEntries(
    (data.daySettings as unknown as DaySettingRow[]).map((d) => [d.plan_id, d])
  )
  const overrideByPlanId = Object.fromEntries(
    overrideRows.filter((o) => !o.is_cancelled).map((o) => [o.plan_id, o])
  )

  const scheduleDefaultsByChildId: Record<string, ScheduleDefaults> = {}
  for (const plan of planRows) {
    if (cancelledPlanIds.has(plan.id) || scheduleDefaultsByChildId[plan.child_id]) continue
    const ov = overrideByPlanId[plan.id]
    const ds = daySettingByPlanId[plan.id]
    scheduleDefaultsByChildId[plan.child_id] = {
      transportType: ov?.transport_type ?? ds?.transport_type ?? plan.transport_type,
      pickupTime: ov?.pickup_time ?? ds?.pickup_time ?? plan.pickup_time,
      dropoffTime: ov?.dropoff_time ?? ds?.dropoff_time ?? plan.dropoff_time,
      serviceStartTime: ov?.service_start_time ?? ds?.service_start_time ?? plan.service_start_time,
      serviceEndTime: ov?.service_end_time ?? ds?.service_end_time ?? plan.service_end_time,
      daytimeSupport: plan.daytime_support ?? false,
      daytimeSupportStartTime: plan.daytime_support_start_time,
      daytimeSupportEndTime: plan.daytime_support_end_time,
    }
  }

  // 予約フィルタリング:
  // - 有効な計画あり → 常に表示
  // - 計画あるが当日がキャンセルoverride → 手動予約（requested_by!=null）のみ表示
  // - 計画なし（削除・曜日変更・終了日変更済み）→ 手動予約のみ表示
  //   ※自動生成予約（requested_by=null）は計画がなければ除外することで同期ズレを防ぐ
  type ReservationWithMeta = Reservation & { requested_by: string | null }
  const reservations = (data.reservations as unknown as ReservationWithMeta[]).filter((r) => {
    if (childHasValidPlan.has(r.child_id)) return true
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

  // daily_attendance に記録があるが allReservations に含まれない子ども（子ども管理から直接登録）を追加。
  // 児童情報は出欠記録のある児童ぶんがまとめて返ってきているので、ここで絞り込む。
  const existingChildIds = new Set(allReservations.map((r) => r.child_id))
  const childById = new Map(
    (data.attendanceChildren as unknown as ChildInfo[]).map((c) => [c.id, c])
  )
  const extraReservations: Reservation[] = attendances
    .map((a) => a.child_id)
    .filter((id) => !existingChildIds.has(id))
    .map((id) => childById.get(id))
    .filter((c): c is ChildInfo => !!c)
    .map((child) => ({
      id: `da-${child.id}`,
      child_id: child.id,
      date: today,
      status: 'scheduled',
      children: child,
    }))
  const finalReservations: Reservation[] = [...allReservations, ...extraReservations]

  // ── 前回コピー用: 児童ごとに、送迎・時間の入力がある直近の出席行を1件だけ採用 ──
  // RPC 経路では DB 側の DISTINCT ON で既に1児童1行に絞られている。
  const prevByChildId: Record<string, PrevAttendanceRow> = {}
  for (const row of data.prev as unknown as PrevAttendanceRow[]) {
    if (!prevByChildId[row.child_id] && hasAnyTransportInput(row)) {
      prevByChildId[row.child_id] = row
    }
  }

  return (
    <AttendanceBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      reservations={finalReservations}
      attendances={attendances}
      staffId={userId ?? ''}
      staffMembers={data.staffMembers}
      vehicles={data.vehicles}
      defaultServiceEndTime={data.defaultServiceEndTime}
      prevByChildId={prevByChildId}
      scheduleDefaultsByChildId={scheduleDefaultsByChildId}
    />
  )
}
