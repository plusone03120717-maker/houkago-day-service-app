import type { AttendanceBoardData } from '@/lib/attendance-board-data'
import type { Reservation, Attendance, PrevAttendanceRow } from '@/components/attendance/attendance-board'
import {
  pickPrimaryPlanPerChild,
  resolveScheduleDefaults,
  type ScheduleDefaults,
  type PlanRow as SchedulePlanRow,
  type OverrideRow as ScheduleOverrideRow,
  type ReservationRow as ScheduleReservationRow,
} from '@/lib/schedule-defaults'

/**
 * 出席管理の「その日に来る児童の行」を組み立てる。
 * 出席管理（/attendance）とスタッフ LINE の送迎タブ（送迎なしの子の一覧）が
 * 同じ顔ぶれになるよう、出席管理のページから切り出した。
 */

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

export type UnitBoard = {
  reservations: Reservation[]
  attendances: Attendance[]
  scheduleDefaults: Record<string, ScheduleDefaults>
  prevByChildId: Record<string, PrevAttendanceRow>
}

/**
 * 1ユニット分の生データを、画面に出す「児童の行」にまとめる。
 * 予約・利用計画・キャンセル・出欠記録のマージ判定はここに集約してあり、
 * 「すべて」表示のときはユニットごとにこの関数を通した結果を連結する。
 */
export function buildUnitBoard(data: AttendanceBoardData, unitId: string, today: string): UnitBoard {
  const todayDow = new Date(today).getDay()
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

  // 優先順位の判断は送迎管理と同じ実装を使う（@/lib/schedule-defaults）。
  // 予約も渡す：保護者の利用連絡で決まった送迎区分・時刻は、計画より優先する
  // （2026-11-14 依頼主。以前は出席管理だけ計画が勝ち、送迎管理と区分がずれていた）
  const scheduleDefaults = resolveScheduleDefaults(
    planRows as unknown as SchedulePlanRow[],
    data.daySettings as unknown as ScheduleOverrideRow[],
    overrideRows as unknown as ScheduleOverrideRow[],
    data.reservations as unknown as ScheduleReservationRow[]
  )

  // 毎週の利用計画が無い日（保護者の利用連絡を承認した日など）は、
  // その日の利用予定に入っている送迎時刻を初期値にする。
  // ここを見ていなかったため、計画の無い児童は名前だけ出て送迎欄が空欄だった。
  // 計画がある児童は今までどおり計画側の値を使う（上書きしない）。
  type ReservationTimes = {
    child_id: string
    transport_type: string | null
    pickup_time: string | null
    dropoff_time: string | null
  }
  for (const r of data.reservations as unknown as ReservationTimes[]) {
    if (scheduleDefaults[r.child_id]) continue
    if (!r.pickup_time && !r.dropoff_time) continue
    scheduleDefaults[r.child_id] = {
      transportType: r.transport_type ?? 'both',
      pickupTime: r.pickup_time,
      dropoffTime: r.dropoff_time,
      serviceStartTime: null,
      serviceEndTime: null,
      daytimeSupport: false,
      daytimeSupportStartTime: null,
      daytimeSupportEndTime: null,
      // 保護者の連絡を承認した予約から作った予定（出席管理の「予定の元」に出す・カード8）
      sources: { transportType: 'request', pickupTime: 'request', dropoffTime: 'request', serviceTime: 'request' },
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

  // 予約に含まれていない利用計画の児童をマージ（キャンセル済みは除外）。
  // 同じ児童に期間・曜日の重なる計画が2本あっても行は1つにする。
  const reservedChildIds = new Set(reservations.map((r) => r.child_id))
  const planReservations: Reservation[] = pickPrimaryPlanPerChild(
    planRows.filter((p) => !cancelledPlanIds.has(p.id))
  )
    .filter((p) => !reservedChildIds.has(p.child_id))
    .map((p) => ({
      id: p.id,
      child_id: p.child_id,
      unit_id: unitId,
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
      unit_id: unitId,
      date: today,
      status: 'scheduled',
      children: child,
    }))
  // 1児童1行にする。どのカードも同じ出席記録（daily_attendance）を編集するため、
  // 同じ児童が2行あっても意味が無いばかりか、別々に保存できてしまい混乱の元になる。
  // 計画の重複はここまでで潰してあるが、予約が二重登録されている場合もここで受け止める。
  // （別ユニットに同じ児童がいる場合は、記録先が別なので行も分かれたままでよい）
  const seenChildIds = new Set<string>()
  const finalReservations: Reservation[] = [...allReservations, ...extraReservations]
    .filter((r) => {
      if (seenChildIds.has(r.child_id)) return false
      seenChildIds.add(r.child_id)
      return true
    })
    // ユニットをまたいで連結するので、どのユニットの行かを必ず持たせる
    .map((r) => ({ ...r, unit_id: unitId }))

  // ── 前回コピー用: 児童ごとに、送迎・時間の入力がある直近の出席行を1件だけ採用 ──
  // RPC 経路では DB 側の DISTINCT ON で既に1児童1行に絞られている。
  const prevByChildId: Record<string, PrevAttendanceRow> = {}
  for (const row of data.prev as unknown as PrevAttendanceRow[]) {
    if (!prevByChildId[row.child_id] && hasAnyTransportInput(row)) {
      prevByChildId[row.child_id] = row
    }
  }

  return { reservations: finalReservations, attendances, scheduleDefaults, prevByChildId }
}
