import { unitChildKey, type loadAttendanceBoardData } from '@/lib/attendance-board-data'
import { buildUnitBoard } from '@/lib/attendance-board-rows'
import type { ScheduleDefaults } from '@/lib/schedule-defaults'
import type { UnitCourse } from '@/lib/unit-course'

/**
 * その日に来る（欠席でない）のに、便に入っていない向きがある児童。
 * 便が無い向きは、その日の予定の送迎区分を見て
 * 「送迎なし（保護者の送り迎え）」か「送迎の予定があるのに便に入っていない」かを分ける。
 */
export type LiffNoTransportChild = {
  name: string
  /** その日に来るユニットの区分（同じ日に2つのユニットに来る子は両方） */
  courses: UnitCourse[]
  /** 行き（お迎え）の扱い。'trip' は便に入っている */
  pickup: 'trip' | 'none' | 'unassigned'
  /** 帰り（お送り）の扱い */
  dropoff: 'trip' | 'none' | 'unassigned'
}

const includesPickup = (t: string | null | undefined) => t === 'both' || t === 'pickup_only'
const includesDropoff = (t: string | null | undefined) => t === 'both' || t === 'dropoff_only'

/**
 * 送迎なしの子の一覧を作る。
 *
 * 送迎管理の便は、管理画面で送迎管理を開いたときに利用スケジュールから作られる。
 * - 作られたあと（そのユニット・向きの送迎表がある）：便に入っていなければ「送迎なし」。
 *   送迎管理で人が外した向きも、その日に人が決めたこととしてそのまま「送迎なし」にする。
 * - まだ作られていない：便が無いのは当たり前なので、すぐ「送迎なし」とは書かない。
 *   その日の予定の送迎区分（保護者の利用連絡 ＞ 特定日 ＞ 曜日 ＞ 計画、@/lib/schedule-defaults）と
 *   その日の記録のドライバーを見て、送迎があるはずの向きは「便に未登録」として分けて出す
 *   （迎えに行くはずの子を「送迎なし」と見せて見落とさないため）。
 */
export function buildNoTransport({
  unitIds,
  courseByUnit,
  date,
  boardDataList,
  scheduleDefaults,
  rows,
  builtSlots,
}: {
  unitIds: string[]
  courseByUnit: Map<string, UnitCourse>
  date: string
  boardDataList: Awaited<ReturnType<typeof loadAttendanceBoardData>>[]
  scheduleDefaults: Record<string, ScheduleDefaults>
  rows: { childId: string; direction: 'pickup' | 'dropoff' }[]
  /** 送迎表が作られているユニット・向き（`${unitId}|${direction}`） */
  builtSlots: Set<string>
}): LiffNoTransportChild[] {
  // 便は児童単位で見る（同じ日に2つのユニットに来る子は、どちらかの便に入っていればよい）
  const inTrip = new Set(rows.map((r) => `${r.childId}|${r.direction}`))

  type Entry = {
    name: string
    nameKana: string | null
    courses: Set<UnitCourse>
    /** 送迎表がまだ無いのに、予定では送迎がある向き */
    unassignedPickup: boolean
    unassignedDropoff: boolean
  }
  const byChild = new Map<string, Entry>()

  boardDataList.forEach((data, i) => {
    const unitId = unitIds[i]
    const board = buildUnitBoard(data, unitId, date)
    const attendanceByChild = new Map(board.attendances.map((a) => [a.child_id, a]))
    type ReservationTransport = { transport_type?: string | null }

    for (const r of board.reservations) {
      if (r.status === 'cancel_waiting') continue
      const att = attendanceByChild.get(r.child_id)
      if (att?.status === 'absent') continue

      const plan = scheduleDefaults[unitChildKey(unitId, r.child_id)] ?? board.scheduleDefaults[r.child_id]
      const type = plan?.transportType ?? (r as unknown as ReservationTransport).transport_type ?? null
      const expectPickup =
        includesPickup(type) || includesPickup(att?.pickup_type) ||
        !!(att?.pickup_driver_member_id || att?.daytime_pickup_driver_member_id)
      const expectDropoff =
        includesDropoff(type) || includesDropoff(att?.pickup_type) ||
        !!(att?.dropoff_driver_member_id || att?.daytime_dropoff_driver_member_id)
      const unassignedPickup = expectPickup && !builtSlots.has(`${unitId}|pickup`)
      const unassignedDropoff = expectDropoff && !builtSlots.has(`${unitId}|dropoff`)

      const entry = byChild.get(r.child_id) ?? {
        name: r.children?.name ?? '不明',
        nameKana: r.children?.name_kana ?? null,
        courses: new Set<UnitCourse>(),
        unassignedPickup: false,
        unassignedDropoff: false,
      }
      entry.courses.add(courseByUnit.get(unitId) ?? 'day')
      entry.unassignedPickup ||= unassignedPickup
      entry.unassignedDropoff ||= unassignedDropoff
      byChild.set(r.child_id, entry)
    }
  })

  const list: { item: LiffNoTransportChild; sortName: string }[] = []
  for (const [childId, e] of byChild) {
    const pickup = inTrip.has(`${childId}|pickup`) ? 'trip' : e.unassignedPickup ? 'unassigned' : 'none'
    const dropoff = inTrip.has(`${childId}|dropoff`) ? 'trip' : e.unassignedDropoff ? 'unassigned' : 'none'
    if (pickup === 'trip' && dropoff === 'trip') continue
    list.push({
      item: { name: e.name, courses: [...e.courses], pickup, dropoff },
      sortName: e.nameKana ?? e.name,
    })
  }

  // 便に未登録の子を先に（見落とすと困るので）、そのあと名前順
  const rank = (c: LiffNoTransportChild) => (c.pickup === 'unassigned' || c.dropoff === 'unassigned' ? 0 : 1)
  return list
    .sort((a, b) => rank(a.item) - rank(b.item) || a.sortName.localeCompare(b.sortName, 'ja'))
    .map((x) => x.item)
}
