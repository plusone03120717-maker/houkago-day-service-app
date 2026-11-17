import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import { getTodayJST } from '@/lib/utils'
import {
  loadAttendanceBoardData,
  ALL_UNITS,
  unitChildKey,
} from '@/lib/attendance-board-data'
import { buildUnitBoard, type UnitBoard } from '@/lib/attendance-board-rows'
import { AttendanceBoard } from '@/components/attendance/attendance-board'
import { getStaffAccess } from '@/lib/require-admin'
import type { Unit, PrevAttendanceRow } from '@/components/attendance/attendance-board'
import type { ScheduleDefaults } from '@/lib/schedule-defaults'
import { defaultSwitchTime, loadHolidayChecker } from '@/lib/daytime-switch'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unit?: string }>
}) {
  const params = await searchParams
  const today = params.date ?? getTodayJST()
  const supabase = await createClient()

  // ユニット未指定は「すべて」。まず全ユニットの顔ぶれを見せ、
  // そこからユニットボタンで絞り込めるようにする。
  const showAllUnits = !params.unit || params.unit === ALL_UNITS

  // データ取得は1ユニットにつき1回（Postgres 関数 get_attendance_board）。
  // 依存関係のあるクエリ（plan_id → 曜日別設定、child_id → 前回コピー用）も
  // DB内で解決されるため、以前のような4段のウォーターフォールは発生しない。
  // 「すべて」のときは1回目の結果に入っているユニット一覧を使って
  // 残りのユニットを並列で取りにいく（サーバー往復は最大2段）。
  const [userId, firstData, access] = await Promise.all([
    getSessionUserId(),
    loadAttendanceBoardData(supabase, showAllUnits ? undefined : params.unit, today),
    // 出席管理を編集できるのはシステム管理者だけ（施設長・スタッフは閲覧のみ）
    getStaffAccess(),
  ])

  const units = firstData.units as unknown as Unit[]
  const selectedUnitId = showAllUnits ? ALL_UNITS : firstData.selectedUnitId

  const boards: { unitId: string; board: UnitBoard }[] = [
    {
      unitId: firstData.selectedUnitId,
      board: buildUnitBoard(firstData, firstData.selectedUnitId, today),
    },
  ]

  if (showAllUnits) {
    const restUnits = units.filter((u) => u.id !== firstData.selectedUnitId)
    const restData = await Promise.all(
      restUnits.map((u) => loadAttendanceBoardData(supabase, u.id, today))
    )
    restUnits.forEach((u, i) => {
      boards.push({ unitId: u.id, board: buildUnitBoard(restData[i], u.id, today) })
    })
  }

  // 「すべて」表示はユニット（放デイ・児発など）で分けず、全員を名前順に並べる
  const reservations = boards.flatMap((b) => b.board.reservations)
  if (showAllUnits) {
    reservations.sort((a, b) =>
      (a.children?.name_kana ?? a.children?.name ?? '').localeCompare(b.children?.name_kana ?? b.children?.name ?? '', 'ja'),
    )
  }
  const attendances = boards.flatMap((b) => b.board.attendances)

  // 同じ児童が複数ユニットに在籍していても取り違えないよう、
  // スケジュール初期値は「ユニット×児童」で引けるようにしておく。
  const scheduleDefaultsByKey: Record<string, ScheduleDefaults> = {}
  // 前回コピー用は児童単位（ユニットに依存しない）なので先勝ちでマージする
  const prevByChildId: Record<string, PrevAttendanceRow> = {}
  for (const { unitId, board } of boards) {
    for (const [childId, sched] of Object.entries(board.scheduleDefaults)) {
      scheduleDefaultsByKey[unitChildKey(unitId, childId)] = sched
    }
    for (const [childId, row] of Object.entries(board.prevByChildId)) {
      if (!prevByChildId[childId]) prevByChildId[childId] = row
    }
  }

  // ── かんたん入力・出席管理のつなぎ目（2026-11-17） ──
  // ・両方の日の切りかえの既定：学校のある日 16:30・休みの日 16:00（子どもごとの学校休日も見る）
  // ・その日の保護者の連絡：未処理があれば行に出して、まとめての確定・出席から外す（カード1）
  //   承認ずみの連絡の区分は、かんたん入力が「予定の区分」として比べる（カード8）
  // ・過ぎた日で出席も欠席も付いていない記録（予定のまま）の日と人数（カード3）
  const realToday = getTodayJST()
  const pastFromDate = new Date(realToday + 'T00:00:00Z')
  pastFromDate.setUTCDate(pastFromDate.getUTCDate() - 31)
  const pastFrom = pastFromDate.toISOString().slice(0, 10)
  const boardChildIds = [...new Set(reservations.map((r) => r.child_id))]
  const [isHoliday, { data: contactsRaw }, { data: pastRaw }] = await Promise.all([
    loadHolidayChecker(supabase, boardChildIds, [today]),
    boardChildIds.length > 0
      ? supabase
          .from('parent_attendance_contacts')
          .select('child_id, status, approval_status, is_new, service_type')
          .eq('date', today)
          .in('child_id', boardChildIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('daily_attendance')
      .select('date')
      .eq('status', 'scheduled')
      .lt('date', realToday)
      .gte('date', pastFrom),
  ])
  const switchTimeByChild: Record<string, string> = {}
  for (const id of boardChildIds) switchTimeByChild[id] = defaultSwitchTime(isHoliday(id, today))

  type ContactRow = {
    child_id: string
    status: 'attending' | 'absent'
    approval_status: 'pending' | 'approved' | 'rejected'
    is_new: boolean
    service_type: string | null
  }
  const pendingContactByChild: Record<string, 'absent' | 'attending'> = {}
  const approvedServiceTypeByChild: Record<string, string> = {}
  for (const c of (contactsRaw ?? []) as ContactRow[]) {
    if (c.is_new) pendingContactByChild[c.child_id] = c.status
    else if (c.status === 'attending' && c.approval_status === 'approved' && c.service_type) {
      approvedServiceTypeByChild[c.child_id] = c.service_type
    }
  }

  const pastCounts = new Map<string, number>()
  for (const r of (pastRaw ?? []) as { date: string }[]) {
    pastCounts.set(r.date, (pastCounts.get(r.date) ?? 0) + 1)
  }
  const pastUnrecorded = [...pastCounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }))

  return (
    <AttendanceBoard
      date={today}
      units={units}
      selectedUnitId={selectedUnitId}
      reservations={reservations}
      attendances={attendances}
      staffId={userId ?? ''}
      staffMembers={firstData.staffMembers}
      vehicles={firstData.vehicles}
      defaultServiceEndTime={firstData.defaultServiceEndTime}
      prevByChildId={prevByChildId}
      scheduleDefaultsByKey={scheduleDefaultsByKey}
      canEdit={access?.canEditOperations ?? false}
      switchTimeByChild={switchTimeByChild}
      pendingContactByChild={pendingContactByChild}
      approvedServiceTypeByChild={approvedServiceTypeByChild}
      pastUnrecorded={pastUnrecorded}
    />
  )
}
