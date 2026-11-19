import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchScheduleDefaults, type ScheduleDefaults } from '@/lib/schedule-defaults'
import { unitChildKey, loadAttendanceBoardData } from '@/lib/attendance-board-data'
import { unitCourseOf, type UnitCourse } from '@/lib/unit-course'
import { buildNoTransport, type LiffNoTransportChild } from '@/lib/liff-no-transport'
import { expectedChildIds, splitByExpected } from '@/lib/transport-expected'
import {
  buildTransportRows,
  TRANSPORT_ATTENDANCE_SELECT,
  TRANSPORT_SCHEDULE_SELECT,
  type RawTransportSchedule,
  type TransportAttendanceRow,
  type TransportReservationRow,
} from '@/lib/transport-rows'

/**
 * スタッフ LINE の「全体」タブの中身。その日の送迎管理（全ユニットまとめて）を便ごとにまとめ、
 * その日に来るのに便に入っていない子（送迎なし）も一緒に返す。
 * 管理画面の送迎管理と同じ組み立て（@/lib/transport-rows）を使う。
 * 閲覧専用なので、管理画面のように利用計画から送迎の行を補完する書き込みはしない。
 */

export type { LiffNoTransportChild }

export type LiffTripChild = {
  name: string
  /** 絞りこみの区分（デイ・英語・パソコン） */
  course: UnitCourse
  time: string | null
  location: string | null
  isDaytime: boolean
  isAbsent: boolean
}

export type LiffTransportTrip = {
  key: string
  direction: 'pickup' | 'dropoff'
  /** 便の中で一番早い送迎時間 */
  time: string | null
  /** 便の全員の時刻がその日の記録として確定しているか（false は予定値） */
  isConfirmed: boolean
  driverNames: string[]
  vehicleNames: string[]
  /** 自分がドライバーに入っている便か */
  isMine: boolean
  children: LiffTripChild[]
}

export async function loadLiffTransport(
  adminClient: SupabaseClient,
  staffMemberId: string,
  date: string,
): Promise<{ trips: LiffTransportTrip[]; noTransport: LiffNoTransportChild[] }> {
  const { data: unitsRaw } = await adminClient.from('units').select('id, name').order('name')
  const units = (unitsRaw ?? []) as { id: string; name: string }[]
  const unitIds = units.map((u) => u.id)
  if (unitIds.length === 0) return { trips: [], noTransport: [] }

  // fetchScheduleDefaults・loadAttendanceBoardData はサーバー用クライアントの型で書かれているが、
  // 使うのは select と rpc だけ
  const defaultsClient = adminClient as unknown as Parameters<typeof fetchScheduleDefaults>[0]
  const boardClient = adminClient as unknown as Parameters<typeof loadAttendanceBoardData>[0]
  const courseByUnit = new Map(units.map((u) => [u.id, unitCourseOf(u.name)]))

  const [
    { data: schedulesRaw, error: schedulesError },
    { data: attendanceRaw, error: attendanceError },
    { data: reservationsRaw },
    { data: vehiclesRaw },
    { data: staffRaw },
    defaultsList,
    boardDataList,
  ] = await Promise.all([
    adminClient.from('transport_schedules').select(TRANSPORT_SCHEDULE_SELECT).in('unit_id', unitIds).eq('date', date),
    adminClient.from('daily_attendance').select(TRANSPORT_ATTENDANCE_SELECT).in('unit_id', unitIds).eq('date', date),
    adminClient
      .from('usage_reservations')
      .select('child_id, unit_id, pickup_time, dropoff_time')
      .in('unit_id', unitIds)
      .eq('date', date)
      .in('status', ['confirmed', 'reserved']),
    adminClient.from('transport_vehicles').select('id, name'),
    adminClient.from('staff_members').select('id, name'),
    Promise.all(unitIds.map((id) => fetchScheduleDefaults(defaultsClient, id, date))),
    // その日に来る児童（出席管理と同じ顔ぶれ）。送迎なしの子を拾うのに使う
    Promise.all(unitIds.map((id) => loadAttendanceBoardData(boardClient, id, date))),
  ])

  if (schedulesError || attendanceError) {
    throw new Error(`送迎の取得に失敗しました: ${(schedulesError ?? attendanceError)?.message}`)
  }

  const scheduleDefaults: Record<string, ScheduleDefaults> = {}
  defaultsList.forEach((defaults, i) => {
    for (const [childId, v] of Object.entries(defaults)) {
      scheduleDefaults[unitChildKey(unitIds[i], childId)] = v
    }
  })

  const { rows: allRows } = buildTransportRows({
    unitIds,
    unitNameById: new Map(units.map((u) => [u.id, u.name])),
    schedules: (schedulesRaw ?? []) as unknown as RawTransportSchedule[],
    attendance: (attendanceRaw ?? []) as unknown as TransportAttendanceRow[],
    reservations: (reservationsRaw ?? []) as unknown as TransportReservationRow[],
    scheduleDefaults,
  })
  // その日に来ない子（出席管理に出ない子）の送迎の行は出さない。前もって作った行が、
  // いつもの予定から曜日が外れたあとも残り、「時間未定」で出ていた（2026-11-19）
  const { coming: rows } = splitByExpected(allRows, expectedChildIds(unitIds, boardDataList, date))

  const vehicleName = new Map(((vehiclesRaw ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]))
  const staffName = new Map(((staffRaw ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))

  // 行は便ごとに連続して並んでいるので、隣り合う同じ便をまとめる
  const trips: LiffTransportTrip[] = []
  for (const r of rows) {
    let trip = trips[trips.length - 1]
    if (!trip || trip.key !== r.groupKey) {
      trip = {
        key: r.groupKey,
        direction: r.direction,
        time: null,
        isConfirmed: true,
        driverNames: [],
        vehicleNames: [],
        isMine: false,
        children: [],
      }
      trips.push(trip)
    }
    trip.children.push({
      name: r.name,
      course: courseByUnit.get(r.unitId) ?? 'day',
      time: r.time,
      location: r.location,
      isDaytime: r.isDaytimeSlot,
      isAbsent: r.isAbsent,
    })
    if (r.isAbsent) continue
    if (r.time && (!trip.time || r.time < trip.time)) trip.time = r.time
    if (!r.isConfirmed) trip.isConfirmed = false
    const driver = r.driverMemberId ? staffName.get(r.driverMemberId) : undefined
    if (driver && !trip.driverNames.includes(driver)) trip.driverNames.push(driver)
    const vehicle = r.vehicleId ? vehicleName.get(r.vehicleId) : undefined
    if (vehicle && !trip.vehicleNames.includes(vehicle)) trip.vehicleNames.push(vehicle)
    if (r.driverMemberId === staffMemberId) trip.isMine = true
  }

  const noTransport = buildNoTransport({
    unitIds,
    courseByUnit,
    date,
    boardDataList,
    scheduleDefaults,
    rows,
    builtSlots: new Set(
      ((schedulesRaw ?? []) as unknown as RawTransportSchedule[]).map(
        (sc) => `${sc.unit_id}|${sc.direction === 'pickup' ? 'pickup' : 'dropoff'}`,
      ),
    ),
  })

  return { trips, noTransport }
}
