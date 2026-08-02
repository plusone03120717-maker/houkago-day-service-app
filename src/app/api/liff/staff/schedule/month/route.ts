import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function toJSTDate(isoStr: string): string {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

function toJSTTime(isoStr: string): string {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(11, 16)
}

type AttendanceRow = {
  date: string
  pickup_driver_member_id: string | null
  dropoff_driver_member_id: string | null
  daytime_support: boolean
  daytime_pickup_driver_member_id: string | null
  daytime_dropoff_driver_member_id: string | null
}

/** 1日の中で自分が担当する送迎の本数を数える */
function countTransport(row: AttendanceRow, staffMemberId: string): number {
  let n = 0
  if (row.pickup_driver_member_id === staffMemberId) n++
  if (row.dropoff_driver_member_id === staffMemberId) n++
  if (row.daytime_support) {
    if (row.daytime_pickup_driver_member_id === staffMemberId) n++
    if (row.daytime_dropoff_driver_member_id === staffMemberId) n++
  }
  return n
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, year, month } = await req.json() as {
      accessToken?: string; year?: number; month?: number
    }
    if (!accessToken || !year || !month) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '年月の指定が不正です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    const lastDay = new Date(year, month, 0).getDate()
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const driverFilter = [
      `pickup_driver_member_id.eq.${staff.staffMemberId}`,
      `dropoff_driver_member_id.eq.${staff.staffMemberId}`,
      `daytime_pickup_driver_member_id.eq.${staff.staffMemberId}`,
      `daytime_dropoff_driver_member_id.eq.${staff.staffMemberId}`,
    ].join(',')

    const [shiftRes, attendanceRes, eventRes, overtimeRes, leaveRes, breakRes] = await Promise.all([
      // シフト（staff_shifts.staff_id は users.id）
      staff.userId
        ? adminClient
            .from('staff_shifts')
            .select('date, shift_type, start_time, end_time')
            .eq('staff_id', staff.userId)
            .gte('date', startDate)
            .lte('date', endDate)
        : Promise.resolve({ data: [] }),

      // 送迎担当（自分がドライバーの行だけに絞る）
      adminClient
        .from('daily_attendance')
        .select(`
          date, daytime_support,
          pickup_driver_member_id, dropoff_driver_member_id,
          daytime_pickup_driver_member_id, daytime_dropoff_driver_member_id
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .neq('status', 'absent')
        .or(driverFilter),

      // 予定・行事
      adminClient
        .from('schedule_events')
        .select('id, event_date')
        .gte('event_date', startDate)
        .lte('event_date', endDate),

      adminClient
        .from('overtime_requests')
        .select('id, date, actual_end_time, status')
        .eq('staff_id', staff.staffMemberId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('request_type', 'pre'),

      adminClient
        .from('paid_leave_usages')
        .select('id, date, days_used')
        .eq('staff_id', staff.staffMemberId)
        .gte('date', startDate)
        .lte('date', endDate),

      adminClient
        .from('time_records')
        .select('type, recorded_at')
        .eq('staff_member_id', staff.staffMemberId)
        .in('type', ['break_start', 'break_end'])
        .gte('recorded_at', new Date(`${startDate}T00:00:00+09:00`).toISOString())
        .lte('recorded_at', new Date(`${endDate}T23:59:59+09:00`).toISOString())
        .order('recorded_at'),
    ])

    // --- シフト ---
    type ShiftRow = { date: string; shift_type: string; start_time: string | null; end_time: string | null }
    const shiftRows = (shiftRes.data ?? []) as unknown as ShiftRow[]

    // --- 送迎担当（日別の件数） ---
    const attendanceRows = (attendanceRes.data ?? []) as unknown as AttendanceRow[]
    const transportByDate = new Map<string, number>()
    for (const row of attendanceRows) {
      const n = countTransport(row, staff.staffMemberId)
      if (n > 0) transportByDate.set(row.date, (transportByDate.get(row.date) ?? 0) + n)
    }

    // --- 予定・行事（自分が担当＋担当者未設定の全体向け）の日別件数 ---
    type EventRow = { id: string; event_date: string }
    const eventRows = (eventRes.data ?? []) as unknown as EventRow[]
    const eventsByDate = new Map<string, number>()

    if (eventRows.length > 0) {
      const { data: eventStaffRaw } = await adminClient
        .from('schedule_event_staff')
        .select('event_id, staff_id')
        .in('event_id', eventRows.map((e) => e.id))
      const eventStaff = (eventStaffRaw ?? []) as unknown as { event_id: string; staff_id: string }[]

      const staffedEventIds = new Set(eventStaff.map((r) => r.event_id))
      const assignedEventIds = new Set(
        staff.userId ? eventStaff.filter((r) => r.staff_id === staff.userId).map((r) => r.event_id) : [],
      )

      for (const e of eventRows) {
        if (assignedEventIds.has(e.id) || !staffedEventIds.has(e.id)) {
          eventsByDate.set(e.event_date, (eventsByDate.get(e.event_date) ?? 0) + 1)
        }
      }
    }

    // --- 日別データにまとめる ---
    const dates = new Set<string>([
      ...shiftRows.map((s) => s.date),
      ...transportByDate.keys(),
      ...eventsByDate.keys(),
    ])
    const days = Array.from(dates).sort().map((date) => {
      const shift = shiftRows.find((s) => s.date === date) ?? null
      return {
        date,
        shiftType: shift?.shift_type ?? null,
        startTime: shift?.start_time ? shift.start_time.slice(0, 5) : null,
        endTime: shift?.end_time ? shift.end_time.slice(0, 5) : null,
        transportCount: transportByDate.get(date) ?? 0,
        eventCount: eventsByDate.get(date) ?? 0,
      }
    })

    // --- 中抜け記録を日付ごとにペアリング ---
    const rawBreaks = (breakRes.data ?? []) as unknown as { type: string; recorded_at: string }[]
    const breaksByDate = new Map<string, { start: string | null; end: string | null }[]>()
    for (const r of rawBreaks) {
      const date = toJSTDate(r.recorded_at)
      if (!breaksByDate.has(date)) breaksByDate.set(date, [])
      const entry = breaksByDate.get(date)!
      if (r.type === 'break_start') {
        entry.push({ start: toJSTTime(r.recorded_at), end: null })
      } else {
        const open = [...entry].reverse().find((e) => e.start !== null && e.end === null)
        if (open) open.end = toJSTTime(r.recorded_at)
        else entry.push({ start: null, end: toJSTTime(r.recorded_at) })
      }
    }
    const breakRecords: { date: string; break_start: string | null; break_end: string | null }[] = []
    for (const [date, pairs] of breaksByDate) {
      for (const pair of pairs) {
        breakRecords.push({ date, break_start: pair.start, break_end: pair.end })
      }
    }

    const leaveUsages = (leaveRes.data ?? []) as unknown as { id: string; date: string; days_used: number }[]

    return NextResponse.json({
      days,
      overtimeRequests: overtimeRes.data ?? [],
      leaveUsages,
      breakRecords,
      summary: {
        workDays: shiftRows.filter((s) => s.shift_type !== 'off' && s.shift_type !== 'holiday').length,
        transportCount: Array.from(transportByDate.values()).reduce((a, b) => a + b, 0),
        leaveDays: leaveUsages.reduce((a, l) => a + Number(l.days_used), 0),
      },
    })
  } catch (err) {
    console.error('[liff/staff/schedule/month]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
