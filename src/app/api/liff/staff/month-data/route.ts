import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { DEFAULT_HOURS_PER_DAY, fiscalYearOf, fiscalYearRange, hourlyLimitHours } from '@/lib/paid-leave'

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

export async function POST(req: NextRequest) {
  try {
    const { accessToken, year, month } = await req.json() as {
      accessToken?: string; year?: number; month?: number
    }
    if (!accessToken || !year || !month) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    // スタッフ特定
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    const staffMemberId = staff?.staffMemberId ?? null
    const hoursPerDay = staff?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY

    if (!staffMemberId) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

    const [overtimeRes, leaveRes, breakRes] = await Promise.all([
      // 残業申請（staff_members.id で検索）
      adminClient
        .from('overtime_requests')
        .select('id, date, actual_end_time, status')
        .eq('staff_id', staffMemberId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('request_type', 'pre'),

      // 有給使用（staff_members.id で検索）
      adminClient
        .from('paid_leave_usages')
        .select('id, date, unit, days_used, hours_used')
        .eq('staff_id', staffMemberId)
        .gte('date', startDate)
        .lte('date', endDate),

      // 中抜け記録（staff_members.id で検索）
      adminClient
        .from('time_records')
        .select('type, recorded_at')
        .eq('staff_member_id', staffMemberId)
        .in('type', ['break_start', 'break_end'])
        .gte('recorded_at', new Date(`${startDate}T00:00:00+09:00`).toISOString())
        .lte('recorded_at', new Date(`${endDate}T23:59:59+09:00`).toISOString())
        .order('recorded_at'),
    ])

    // 中抜け記録をdateでグループ化してペアリング
    type RawBreak = { type: string; recorded_at: string }
    const rawBreaks = (breakRes.data ?? []) as RawBreak[]
    const breaksByDate = new Map<string, { start: string | null; end: string | null }[]>()
    for (const r of rawBreaks) {
      const date = toJSTDate(r.recorded_at)
      if (!breaksByDate.has(date)) breaksByDate.set(date, [])
      const entry = breaksByDate.get(date)!
      if (r.type === 'break_start') {
        entry.push({ start: toJSTTime(r.recorded_at), end: null })
      } else {
        const last = [...entry].reverse().find((e) => e.start !== null && e.end === null)
        if (last) {
          last.end = toJSTTime(r.recorded_at)
        } else {
          entry.push({ start: null, end: toJSTTime(r.recorded_at) })
        }
      }
    }

    const breakRecords: { date: string; break_start: string | null; break_end: string | null }[] = []
    for (const [date, pairs] of breaksByDate) {
      for (const pair of pairs) {
        breakRecords.push({ date, break_start: pair.start, break_end: pair.end })
      }
    }

    // 時間単位年休の年間残枠（労基法39条4項: 年5日分が上限）
    const fiscalYear = fiscalYearOf(startDate)
    const { start: fyStart, end: fyEnd } = fiscalYearRange(fiscalYear)
    const { data: hourlyRaw } = await adminClient
      .from('paid_leave_usages')
      .select('hours_used')
      .eq('staff_id', staffMemberId)
      .eq('unit', 'hour')
      .gte('date', fyStart)
      .lte('date', fyEnd)
    const hourlyUsedHours = ((hourlyRaw ?? []) as { hours_used: number | null }[])
      .reduce((sum, r) => sum + Number(r.hours_used ?? 0), 0)

    return NextResponse.json({
      overtimeRequests: overtimeRes.data ?? [],
      leaveUsages: leaveRes.data ?? [],
      breakRecords,
      leavePolicy: {
        fiscalYear,
        hoursPerDay,
        hourlyLimitHours: hourlyLimitHours(hoursPerDay),
        hourlyUsedHours,
      },
    })
  } catch (err) {
    console.error('[liff/staff/month-data]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
