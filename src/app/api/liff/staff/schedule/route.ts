import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toJSTTime(isoStr: string): string {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(11, 16)
}

type AttendanceRow = {
  id: string
  child_id: string
  children: { id: string; name: string } | null
  pickup_driver_member_id: string | null
  pickup_vehicle_id: string | null
  pickup_departure_time: string | null
  pickup_arrival_time: string | null
  dropoff_driver_member_id: string | null
  dropoff_vehicle_id: string | null
  dropoff_departure_time: string | null
  dropoff_arrival_time: string | null
  daytime_support: boolean
  daytime_pickup_driver_member_id: string | null
  daytime_pickup_vehicle_id: string | null
  daytime_pickup_departure_time: string | null
  daytime_pickup_arrival_time: string | null
  daytime_dropoff_driver_member_id: string | null
  daytime_dropoff_vehicle_id: string | null
  daytime_dropoff_departure_time: string | null
  daytime_dropoff_arrival_time: string | null
}

type TransportItem = {
  direction: 'pickup' | 'dropoff' | 'daytime_pickup' | 'daytime_dropoff'
  childName: string
  vehicleName: string | null
  departureTime: string | null
  arrivalTime: string | null
}

function buildTransport(
  staffMemberId: string,
  rows: AttendanceRow[],
  vehicleMap: Map<string, string>,
): TransportItem[] {
  const items: TransportItem[] = []
  const push = (
    direction: TransportItem['direction'],
    childName: string,
    vehicleId: string | null,
    departureTime: string | null,
    arrivalTime: string | null,
  ) => {
    items.push({
      direction,
      childName,
      vehicleName: vehicleId ? (vehicleMap.get(vehicleId) ?? null) : null,
      departureTime: departureTime ? departureTime.slice(0, 5) : null,
      arrivalTime: arrivalTime ? arrivalTime.slice(0, 5) : null,
    })
  }

  for (const a of rows) {
    const childName = a.children?.name ?? '—'
    if (a.pickup_driver_member_id === staffMemberId) {
      push('pickup', childName, a.pickup_vehicle_id, a.pickup_departure_time, a.pickup_arrival_time)
    }
    if (a.dropoff_driver_member_id === staffMemberId) {
      push('dropoff', childName, a.dropoff_vehicle_id, a.dropoff_departure_time, a.dropoff_arrival_time)
    }
    if (a.daytime_support) {
      if (a.daytime_pickup_driver_member_id === staffMemberId) {
        push('daytime_pickup', childName, a.daytime_pickup_vehicle_id, a.daytime_pickup_departure_time, a.daytime_pickup_arrival_time)
      }
      if (a.daytime_dropoff_driver_member_id === staffMemberId) {
        push('daytime_dropoff', childName, a.daytime_dropoff_vehicle_id, a.daytime_dropoff_departure_time, a.daytime_dropoff_arrival_time)
      }
    }
  }

  return items.sort((a, b) => (a.departureTime ?? '99:99').localeCompare(b.departureTime ?? '99:99'))
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

    const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString()
    const dayEnd = new Date(`${date}T23:59:59+09:00`).toISOString()

    const [shiftRes, attendanceRes, vehicleRes, eventRes, overtimeRes, leaveRes, breakRes] = await Promise.all([
      // シフト（staff_shifts.staff_id は users.id）
      staff.userId
        ? adminClient
            .from('staff_shifts')
            .select('shift_type, start_time, end_time, break_start_time, break_end_time, note')
            .eq('staff_id', staff.userId)
            .eq('date', date)
            .limit(1)
        : Promise.resolve({ data: [] }),

      // 送迎担当（daily_attendance の各ドライバー欄は staff_members.id）
      adminClient
        .from('daily_attendance')
        .select(`
          id, child_id,
          pickup_driver_member_id, pickup_vehicle_id, pickup_departure_time, pickup_arrival_time,
          dropoff_driver_member_id, dropoff_vehicle_id, dropoff_departure_time, dropoff_arrival_time,
          daytime_support,
          daytime_pickup_driver_member_id, daytime_pickup_vehicle_id, daytime_pickup_departure_time, daytime_pickup_arrival_time,
          daytime_dropoff_driver_member_id, daytime_dropoff_vehicle_id, daytime_dropoff_departure_time, daytime_dropoff_arrival_time,
          children(id, name)
        `)
        .eq('date', date)
        .neq('status', 'absent'),

      adminClient.from('transport_vehicles').select('id, name'),

      // 予定・行事
      adminClient
        .from('schedule_events')
        .select('id, title, event_type, start_time, end_time, all_day, note, child_id')
        .eq('event_date', date)
        .order('start_time', { nullsFirst: true }),

      adminClient
        .from('overtime_requests')
        .select('actual_end_time, status')
        .eq('staff_id', staff.staffMemberId)
        .eq('date', date)
        .eq('request_type', 'pre')
        .limit(1),

      adminClient
        .from('paid_leave_usages')
        .select('days_used')
        .eq('staff_id', staff.staffMemberId)
        .eq('date', date)
        .limit(1),

      adminClient
        .from('time_records')
        .select('type, recorded_at')
        .eq('staff_member_id', staff.staffMemberId)
        .in('type', ['break_start', 'break_end'])
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at'),
    ])

    // --- シフト ---
    type ShiftRow = {
      shift_type: string
      start_time: string | null
      end_time: string | null
      break_start_time: string | null
      break_end_time: string | null
      note: string | null
    }
    const shiftRows = (shiftRes.data ?? []) as unknown as ShiftRow[]
    const shift = shiftRows.length > 0 ? shiftRows[0] : null

    // --- 送迎担当 ---
    const vehicles = (vehicleRes.data ?? []) as { id: string; name: string }[]
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v.name]))
    const transport = buildTransport(
      staff.staffMemberId,
      (attendanceRes.data ?? []) as unknown as AttendanceRow[],
      vehicleMap,
    )

    // --- 予定・行事（自分が担当のもの＋担当者未設定＝全体のもの） ---
    type EventRow = {
      id: string
      title: string
      event_type: string
      start_time: string | null
      end_time: string | null
      all_day: boolean
      note: string | null
      child_id: string | null
    }
    const eventRows = (eventRes.data ?? []) as unknown as EventRow[]
    const eventIds = eventRows.map((e) => e.id)

    let assignedEventIds = new Set<string>()
    let staffedEventIds = new Set<string>()
    const childIdsByEvent = new Map<string, string[]>()
    const childNameById = new Map<string, string>()

    if (eventIds.length > 0) {
      const [eventStaffRes, eventChildrenRes] = await Promise.all([
        adminClient
          .from('schedule_event_staff')
          .select('event_id, staff_id')
          .in('event_id', eventIds),
        adminClient
          .from('schedule_event_children')
          .select('event_id, child_id')
          .in('event_id', eventIds),
      ])

      const eventStaff = (eventStaffRes.data ?? []) as unknown as { event_id: string; staff_id: string }[]
      staffedEventIds = new Set(eventStaff.map((r) => r.event_id))
      assignedEventIds = new Set(
        staff.userId ? eventStaff.filter((r) => r.staff_id === staff.userId).map((r) => r.event_id) : [],
      )

      const eventChildren = (eventChildrenRes.data ?? []) as unknown as {
        event_id: string
        child_id: string
      }[]
      for (const row of eventChildren) {
        const list = childIdsByEvent.get(row.event_id) ?? []
        list.push(row.child_id)
        childIdsByEvent.set(row.event_id, list)
      }

      // 児童名をまとめて取得（ジャンクション経由＋イベント直下の child_id）
      const allChildIds = Array.from(new Set([
        ...eventChildren.map((r) => r.child_id),
        ...eventRows.map((e) => e.child_id).filter((v): v is string => v !== null),
      ]))
      if (allChildIds.length > 0) {
        const { data: childRows } = await adminClient
          .from('children')
          .select('id, name')
          .in('id', allChildIds)
        for (const c of (childRows ?? []) as unknown as { id: string; name: string }[]) {
          childNameById.set(c.id, c.name)
        }
      }
    }

    const events = eventRows
      // 担当に指名されている、または担当者未設定（全体向け）のイベントのみ
      .filter((e) => assignedEventIds.has(e.id) || !staffedEventIds.has(e.id))
      .map((e) => {
        const childNames = (childIdsByEvent.get(e.id) ?? [])
          .map((id) => childNameById.get(id))
          .filter((n): n is string => !!n)
        if (childNames.length === 0 && e.child_id) {
          const name = childNameById.get(e.child_id)
          if (name) childNames.push(name)
        }
        return {
          id: e.id,
          title: e.title,
          eventType: e.event_type,
          startTime: e.start_time ? e.start_time.slice(0, 5) : null,
          endTime: e.end_time ? e.end_time.slice(0, 5) : null,
          allDay: e.all_day,
          note: e.note,
          childNames,
          assigned: assignedEventIds.has(e.id),
        }
      })

    // --- 申請状況 ---
    const overtimeRows = (overtimeRes.data ?? []) as unknown as { actual_end_time: string | null; status: string }[]
    const leaveRows = (leaveRes.data ?? []) as unknown as { days_used: number }[]

    const rawBreaks = (breakRes.data ?? []) as unknown as { type: string; recorded_at: string }[]
    const breaks: { start: string | null; end: string | null }[] = []
    for (const r of rawBreaks) {
      if (r.type === 'break_start') {
        breaks.push({ start: toJSTTime(r.recorded_at), end: null })
      } else {
        const open = [...breaks].reverse().find((b) => b.start !== null && b.end === null)
        if (open) open.end = toJSTTime(r.recorded_at)
        else breaks.push({ start: null, end: toJSTTime(r.recorded_at) })
      }
    }

    return NextResponse.json({
      staff: { name: staff.name },
      date,
      shift: shift
        ? {
            shiftType: shift.shift_type,
            startTime: shift.start_time ? shift.start_time.slice(0, 5) : null,
            endTime: shift.end_time ? shift.end_time.slice(0, 5) : null,
            breakStartTime: shift.break_start_time ? shift.break_start_time.slice(0, 5) : null,
            breakEndTime: shift.break_end_time ? shift.break_end_time.slice(0, 5) : null,
            note: shift.note,
          }
        : null,
      hasLoginAccount: staff.userId !== null,
      transport,
      events,
      overtime: overtimeRows.length > 0
        ? { actualEndTime: overtimeRows[0].actual_end_time?.slice(0, 5) ?? null, status: overtimeRows[0].status }
        : null,
      leave: leaveRows.length > 0 ? { daysUsed: leaveRows[0].days_used } : null,
      breaks,
    })
  } catch (err) {
    console.error('[liff/staff/schedule]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
