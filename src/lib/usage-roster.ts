/**
 * 「その日、誰が利用するのか」を1か所で決めるための共通ロジック。
 *
 * 利用日は3つのテーブルに散らばっている。
 *   - usage_reservations … 利用予約（利用計画から自動生成される分と、手で足した分）
 *   - usage_plans        … 毎週の利用計画（＋ usage_plan_date_overrides の特定日キャンセル）
 *   - daily_attendance   … 実際の出欠記録（計画外の日に来た日・出席カレンダーから足した日）
 *
 * 画面ごとにどれを見るかがバラバラだったため、同じ日でも画面によって人数が違う、
 * という食い違いが起きていた（例: 予約が無い児童が出席管理の月別ビューから丸ごと
 * 抜ける）。この関数を通せばどの画面でも同じ顔ぶれ・同じ人数になる。
 *
 * 判定ルールは出席管理の日別ビュー（src/app/(dashboard)/attendance/page.tsx）に
 * 合わせてある。あちらは児童の写真・アレルギー等も一緒に組み立てる都合で独自の
 * マージを持っているが、対象の児童を決めるルールはこのファイルと同じ。
 */

export type RosterReservation = {
  id: string
  child_id: string
  date: string
  status: string
  /** 手で追加した予約は職員ID、利用計画からの自動生成は null */
  requested_by?: string | null
}

export type RosterPlan = {
  id: string
  child_id: string
  start_date: string
  end_date: string | null
  day_of_week: number[] | null
}

export type RosterOverride = {
  plan_id: string
  date: string
  is_cancelled: boolean
}

export type RosterAttendance = {
  child_id: string
  date: string
  status: string
}

export type RosterEntry = {
  childId: string
  date: string
  /** その日の予約行（キャンセル済みも含む）。無ければ null */
  reservation: RosterReservation | null
  /** その日に有効な利用計画のID（特定日キャンセルされたものは除く）。無ければ null */
  planId: string | null
  /** 出欠記録の状態（'attended' | 'absent' | 'scheduled'）。記録が無ければ null */
  attendanceStatus: string | null
  /** 欠席として扱う日か */
  absent: boolean
  /** その日の利用として扱う行か（＝出席管理に行が出る。欠席記録の日も true） */
  planned: boolean
  /** 利用人数として数える行か（planned かつ欠席でない） */
  counts: boolean
}

/** "2026-08-03" → 曜日番号（0=日曜。JSの getDay() と同じ） */
function dowOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

/** 期間内の日付を "YYYY-MM-DD" で列挙する */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  const cursor = new Date(from + 'T00:00:00')
  const last = new Date(to + 'T00:00:00')
  while (cursor <= last) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function groupByDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.date)
    if (list) list.push(row)
    else map.set(row.date, [row])
  }
  return map
}

/**
 * 日付ごとの利用児童一覧を作る。
 * 同じ児童が予約・計画・記録の複数に出てきても、1日1行にまとめる。
 */
export function buildUsageRoster({
  dates,
  reservations,
  plans,
  overrides,
  attendances,
}: {
  dates: string[]
  reservations: RosterReservation[]
  plans: RosterPlan[]
  overrides: RosterOverride[]
  attendances: RosterAttendance[]
}): Map<string, RosterEntry[]> {
  const reservationsByDate = groupByDate(reservations)
  const attendancesByDate = groupByDate(attendances)

  // 日付 → その日キャンセルされた計画ID
  const cancelledPlanIdsByDate = new Map<string, Set<string>>()
  for (const o of overrides) {
    if (!o.is_cancelled) continue
    const set = cancelledPlanIdsByDate.get(o.date)
    if (set) set.add(o.plan_id)
    else cancelledPlanIdsByDate.set(o.date, new Set([o.plan_id]))
  }

  const result = new Map<string, RosterEntry[]>()

  for (const date of dates) {
    const dow = dowOf(date)
    const cancelledPlanIds = cancelledPlanIdsByDate.get(date) ?? new Set<string>()

    // その日に有効な計画（1児童1本。期間・曜日が重なる計画が2本あっても行は増やさない）
    const planIdByChild = new Map<string, string>()
    for (const p of plans) {
      if (p.start_date > date) continue
      if (p.end_date !== null && p.end_date < date) continue
      if (!(p.day_of_week ?? []).includes(dow)) continue
      if (cancelledPlanIds.has(p.id)) continue
      if (!planIdByChild.has(p.child_id)) planIdByChild.set(p.child_id, p.id)
    }

    const reservationByChild = new Map<string, RosterReservation>()
    for (const r of reservationsByDate.get(date) ?? []) reservationByChild.set(r.child_id, r)

    const attendanceByChild = new Map<string, RosterAttendance>()
    for (const a of attendancesByDate.get(date) ?? []) attendanceByChild.set(a.child_id, a)

    const childIds = new Set<string>([
      ...reservationByChild.keys(),
      ...planIdByChild.keys(),
      ...attendanceByChild.keys(),
    ])

    const entries: RosterEntry[] = []
    for (const childId of childIds) {
      const reservation = reservationByChild.get(childId) ?? null
      const planId = planIdByChild.get(childId) ?? null
      const attendanceStatus = attendanceByChild.get(childId)?.status ?? null

      const liveReservation = reservation !== null && reservation.status !== 'cancelled'
      // 予約は利用計画から自動生成されるため、あとから計画の曜日・期間を変えると
      // 実態に合わない予約が残る。出席管理と同じく、計画のない自動生成予約
      //（requested_by = null）は予定として扱わない。
      const reservationPlanned =
        liveReservation && (planId !== null || reservation!.requested_by != null)
      const waiting = liveReservation && reservation!.status === 'cancel_waiting'

      // 記録があればそれが最優先。無い日だけ予約のキャンセル待ちを欠席として扱う
      const absent = attendanceStatus !== null ? attendanceStatus === 'absent' : waiting
      const planned = attendanceStatus !== null || planId !== null || reservationPlanned

      // キャンセル済みの予約しか無い児童も、行そのものは返す
      //（利用状況ページが「キャンセル」として表示し、復元できるようにするため）
      if (!planned && reservation === null) continue

      entries.push({
        childId,
        date,
        reservation,
        planId,
        attendanceStatus,
        absent,
        planned,
        counts: planned && !absent,
      })
    }

    result.set(date, entries)
  }

  return result
}
