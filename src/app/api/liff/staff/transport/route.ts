import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { logStaffView } from '@/lib/line/log-staff-view'
import { fetchScheduleDefaults, type ScheduleDefaults } from '@/lib/schedule-defaults'
import { unitChildKey } from '@/lib/attendance-board-data'
import {
  buildTransportRows,
  TRANSPORT_ATTENDANCE_SELECT,
  TRANSPORT_SCHEDULE_SELECT,
  type RawTransportSchedule,
  type TransportAttendanceRow,
  type TransportReservationRow,
} from '@/lib/transport-rows'

/**
 * スタッフ LINE の「全体」タブ：その日の送迎管理（全ユニットまとめて）を閲覧だけする。
 * 管理画面の送迎管理と同じ組み立て（@/lib/transport-rows）で、便ごとにまとめて返す。
 * 閲覧専用なので、管理画面のように利用計画から送迎の行を補完する書き込みはしない。
 */

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type TripChild = {
  name: string
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
  children: TripChild[]
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date } = await req.json() as { accessToken?: string; date?: string }
    if (!accessToken || !date) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: '日付の形式が不正です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    await logStaffView(adminClient, staff.staffMemberId, 'staff-transport', date)

    const { data: unitsRaw } = await adminClient.from('units').select('id, name').order('name')
    const units = (unitsRaw ?? []) as { id: string; name: string }[]
    const unitIds = units.map((u) => u.id)
    if (unitIds.length === 0) return NextResponse.json({ date, trips: [] })

    // fetchScheduleDefaults はサーバー用クライアントの型で書かれているが、使うのは select だけ
    const defaultsClient = adminClient as unknown as Parameters<typeof fetchScheduleDefaults>[0]

    const [
      { data: schedulesRaw, error: schedulesError },
      { data: attendanceRaw, error: attendanceError },
      { data: reservationsRaw },
      { data: vehiclesRaw },
      { data: staffRaw },
      defaultsList,
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
    ])

    if (schedulesError || attendanceError) {
      console.error('[liff/staff/transport]', schedulesError ?? attendanceError)
      return NextResponse.json({ error: '送迎の取得に失敗しました' }, { status: 500 })
    }

    const scheduleDefaults: Record<string, ScheduleDefaults> = {}
    defaultsList.forEach((defaults, i) => {
      for (const [childId, v] of Object.entries(defaults)) {
        scheduleDefaults[unitChildKey(unitIds[i], childId)] = v
      }
    })

    const { rows } = buildTransportRows({
      unitIds,
      unitNameById: new Map(units.map((u) => [u.id, u.name])),
      schedules: (schedulesRaw ?? []) as unknown as RawTransportSchedule[],
      attendance: (attendanceRaw ?? []) as unknown as TransportAttendanceRow[],
      reservations: (reservationsRaw ?? []) as unknown as TransportReservationRow[],
      scheduleDefaults,
    })

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
      if (r.driverMemberId === staff.staffMemberId) trip.isMine = true
    }

    return NextResponse.json({ date, trips })
  } catch (err) {
    console.error('[liff/staff/transport]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
