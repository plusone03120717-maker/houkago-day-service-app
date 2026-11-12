import type { TransportRow } from '@/components/transport/transport-board'
import { transportTimeOf, resolveSlotFor, type ScheduleDefaults } from '@/lib/schedule-defaults'
import { unitChildKey } from '@/lib/attendance-board-data'
import type { DriverScores } from '@/lib/driver-ranking'

/**
 * 送迎管理の一覧（児童1人 × 1方向の行）を組み立てる。
 * 管理画面の送迎管理（/transport）とスタッフ LINE の送迎タブが同じ並び・同じ時刻で
 * 見えるよう、取得した行から一覧を作る部分をここにまとめている。
 */

// 送迎明細が持つのは「誰を・どこで・どの順に」だけ。
// 時刻・ドライバー・車種はその日の記録（daily_attendance）が唯一の正。
export const TRANSPORT_SCHEDULE_SELECT = `
  id, unit_id, direction,
  transport_details (
    id, child_id, pickup_location, sort_order, trip_group_id,
    children (id, name, name_kana, address, school_id, schools(id, name))
  )
`

// 日中一時の送迎は日中一時側の欄に入る（@/lib/schedule-defaults）。
// どちらに入っているかを判定するため、利用時間・日中一時の時刻も一緒に読む。
export const TRANSPORT_ATTENDANCE_SELECT = `
  child_id, unit_id, status, basic_service,
  pickup_departure_time, pickup_arrival_time, pickup_driver_member_id, pickup_vehicle_id,
  dropoff_departure_time, dropoff_arrival_time, dropoff_driver_member_id, dropoff_vehicle_id,
  daytime_pickup_departure_time, daytime_pickup_arrival_time,
  daytime_pickup_driver_member_id, daytime_pickup_vehicle_id,
  daytime_dropoff_departure_time, daytime_dropoff_arrival_time,
  daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id,
  service_start_time, service_end_time,
  daytime_support, daytime_support_start_time, daytime_support_end_time
`

export type RawTransportSchedule = {
  id: string
  unit_id: string
  direction: string
  transport_details: {
    id: string
    child_id: string
    pickup_location: string | null
    sort_order: number
    trip_group_id: string | null
    children: {
      id: string
      name: string
      name_kana: string | null
      address: string | null
      school_id: string | null
      schools: { id: string; name: string } | null
    } | null
  }[]
}

export type TransportAttendanceRow = {
  child_id: string
  unit_id: string
  status: string
  basic_service: boolean | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean | null
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

/** その日の利用予定の送迎時刻。利用スケジュールが無い児童の予定値になる */
export type TransportReservationRow = {
  child_id: string
  unit_id: string
  pickup_time: string | null
  dropoff_time: string | null
}

type BuildInput = {
  /** 対象ユニット（入れ物スケジュールの控えを用意する） */
  unitIds: string[]
  unitNameById: Map<string, string>
  schedules: RawTransportSchedule[]
  attendance: TransportAttendanceRow[]
  reservations: TransportReservationRow[]
  /** unitChildKey(ユニット, 児童) → 利用スケジュールの予定値 */
  scheduleDefaults: Record<string, ScheduleDefaults>
  /** ドライバーの選択肢を並べるための点数（管理画面だけが使う） */
  driverScoresFor?: (childId: string, slot: 'pickup' | 'dropoff' | 'daytime_pickup' | 'daytime_dropoff') => DriverScores
}

export function buildTransportRows({
  unitIds,
  unitNameById,
  schedules,
  attendance,
  reservations,
  scheduleDefaults,
  driverScoresFor,
}: BuildInput): {
  /** 便ごとにまとめて、送迎時間の早い順に並べた行 */
  rows: TransportRow[]
  /** ユニットID → 方向ごとの入れ物スケジュール */
  scheduleIdsByUnit: Record<string, { pickup: string | null; dropoff: string | null }>
} {
  const reservationByChild = new Map<string, TransportReservationRow>()
  for (const r of reservations) {
    reservationByChild.set(unitChildKey(r.unit_id, r.child_id), r)
  }

  // 「すべて」表示ではユニットをまたぐため、出席記録はユニット×児童で引く
  const attendanceByChild = new Map<string, TransportAttendanceRow>()
  for (const a of attendance) {
    attendanceByChild.set(unitChildKey(a.unit_id, a.child_id), a)
  }

  // 便ごとの入れ子をやめ、児童1人1行のフラットな一覧に変換する。
  // 便は表からは消えたが DB 上は方向ごとの入れ物として残るため、
  // 追加・方向変更で使う schedule_id を方向別に控えておく。
  const scheduleIdsByUnit: Record<string, { pickup: string | null; dropoff: string | null }> = {}
  for (const id of unitIds) scheduleIdsByUnit[id] = { pickup: null, dropoff: null }
  const rows: TransportRow[] = []

  for (const sched of schedules) {
    const direction = sched.direction === 'pickup' ? 'pickup' : 'dropoff'
    const slot = (scheduleIdsByUnit[sched.unit_id] ??= { pickup: null, dropoff: null })
    if (!slot[direction]) slot[direction] = sched.id

    for (const d of sched.transport_details ?? []) {
      const att = attendanceByChild.get(unitChildKey(sched.unit_id, d.child_id))
      const plan = scheduleDefaults[unitChildKey(sched.unit_id, d.child_id)]

      // お迎え・お送りとも出発時間の欄を出す（お迎え＝学校などに着いて出る時刻、
      // お送り＝事業所を出る時刻。@/lib/schedule-defaults の transportTimeOf）。
      // 記録が無ければ利用スケジュールの予定値を未確定として表示する。
      // 利用スケジュールも無い日（保護者の利用連絡を承認した日など）は、
      // その日の利用予定に入っている時刻を使う。ここを見ていなかったため、
      // 毎週の計画が無い児童は送迎管理の時刻がずっと空欄になっていた。
      // 日中一時の送迎にあたる行は、日中一時側の欄が記録先になる。
      const isDaytime = resolveSlotFor(direction, att, plan) === 'daytime'
      const recorded =
        direction === 'pickup'
          ? isDaytime
            ? transportTimeOf(att?.daytime_pickup_departure_time, att?.daytime_pickup_arrival_time)
            : transportTimeOf(att?.pickup_departure_time, att?.pickup_arrival_time)
          : isDaytime
          ? transportTimeOf(att?.daytime_dropoff_departure_time, att?.daytime_dropoff_arrival_time)
          : transportTimeOf(att?.dropoff_departure_time, att?.dropoff_arrival_time)
      const reservation = reservationByChild.get(unitChildKey(sched.unit_id, d.child_id))
      const planned =
        (direction === 'pickup' ? plan?.pickupTime : plan?.dropoffTime) ??
        (direction === 'pickup' ? reservation?.pickup_time : reservation?.dropoff_time)

      rows.push({
        id: d.id,
        childId: d.child_id,
        unitId: sched.unit_id,
        unitName: unitNameById.get(sched.unit_id) ?? '',
        direction,
        name: d.children?.name ?? '不明',
        nameKana: d.children?.name_kana ?? null,
        time: (recorded ?? planned)?.slice(0, 5) ?? null,
        isConfirmed: !!recorded,
        isAbsent: att?.status === 'absent',
        location: d.pickup_location,
        isDaytimeSlot: isDaytime,
        driverMemberId:
          (direction === 'pickup'
            ? isDaytime
              ? att?.daytime_pickup_driver_member_id
              : att?.pickup_driver_member_id
            : isDaytime
            ? att?.daytime_dropoff_driver_member_id
            : att?.dropoff_driver_member_id) ?? null,
        vehicleId:
          (direction === 'pickup'
            ? isDaytime
              ? att?.daytime_pickup_vehicle_id
              : att?.pickup_vehicle_id
            : isDaytime
            ? att?.daytime_dropoff_vehicle_id
            : att?.dropoff_vehicle_id) ?? null,
        sortOrder: d.sort_order,
        // 手動で組み分けされていれば その ID、なければ 区分・時間・場所で自動判定。
        // 放デイと児発の子が同じ車に乗るので、自動判定の便もユニットをまたいでまとめる
        // （送迎の記録先は行ごとの出席記録なので、便がユニットをまたいでも困らない）
        groupKey:
          d.trip_group_id ??
          `auto|${direction}|${(recorded ?? planned)?.slice(0, 5) ?? ''}|${d.pickup_location ?? ''}`,
        isManualGroup: !!d.trip_group_id,
        schoolName: d.children?.schools?.name ?? null,
        homeAddress: d.children?.address ?? null,
        driverScores: driverScoresFor?.(
          d.child_id,
          isDaytime ? (direction === 'pickup' ? 'daytime_pickup' : 'daytime_dropoff') : direction
        ),
      })
    }
  }

  return { rows: orderTransportRows(rows), scheduleIdsByUnit }
}

/**
 * 便（groupKey）ごとにまとめてから並べる。
 * 手動でまとめた便は時間や場所がばらばらでも1つの塊として扱うため、
 * 行単体ではなく便単位で並べないと画面上で離れてしまう。
 */
function orderTransportRows(rows: TransportRow[]): TransportRow[] {
  const byGroup = new Map<string, TransportRow[]>()
  for (const r of rows) {
    const list = byGroup.get(r.groupKey)
    if (list) list.push(r)
    else byGroup.set(r.groupKey, [r])
  }

  /** 便の代表値。並び順は「一番早い送迎時間」で決める */
  const groupSortKey = (members: TransportRow[]) => {
    const times = members.map((m) => m.time).filter((t): t is string => !!t)
    return {
      time: times.length > 0 ? times.sort()[0] : null,
      direction: members[0].direction,
      location: members[0].location ?? '',
      sortOrder: Math.min(...members.map((m) => m.sortOrder)),
    }
  }

  // 便の中は 送迎時間 → sort_order → 名前順
  const sortMembers = (members: TransportRow[]) =>
    members.sort((a, b) => {
      if (a.time && b.time) {
        if (a.time !== b.time) return a.time < b.time ? -1 : 1
      } else if (a.time) return -1
      else if (b.time) return 1
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja')
    })

  // 送迎時間の早い順。時間未設定の便は末尾。同時刻は 区分 → 場所 → sort_order
  return [...byGroup.values()]
    .map((members) => ({ members: sortMembers(members), key: groupSortKey(members) }))
    .sort((a, b) => {
      if (a.key.time && b.key.time) {
        if (a.key.time !== b.key.time) return a.key.time < b.key.time ? -1 : 1
      } else if (a.key.time) return -1
      else if (b.key.time) return 1
      if (a.key.direction !== b.key.direction) return a.key.direction === 'pickup' ? -1 : 1
      if (a.key.location !== b.key.location) return a.key.location.localeCompare(b.key.location, 'ja')
      return a.key.sortOrder - b.key.sortOrder
    })
    .flatMap((g) => g.members)
}
