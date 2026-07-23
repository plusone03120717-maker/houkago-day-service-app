import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

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
    let staffMemberId: string | null = null
    let userId: string | null = null

    const { data: staffRows } = await adminClient
      .from('staff_members')
      .select('id, user_id')
      .eq('line_user_id', lineUserId)
      .limit(1)
    const staffRow = staffRows && (staffRows as { id: string; user_id: string | null }[]).length > 0
      ? (staffRows as { id: string; user_id: string | null }[])[0] : null

    if (staffRow) {
      staffMemberId = staffRow.id
      userId = staffRow.user_id ?? null
    } else {
      const { data: userRows } = await adminClient
        .from('users')
        .select('id')
        .eq('line_user_id', lineUserId)
        .limit(1)
      const linkedUser = userRows && (userRows as { id: string }[]).length > 0 ? (userRows as { id: string }[])[0] : null
      if (linkedUser) {
        const { data: memberRows } = await adminClient
          .from('staff_members')
          .select('id, user_id')
          .eq('user_id', linkedUser.id)
          .limit(1)
        const member = memberRows && (memberRows as { id: string; user_id: string | null }[]).length > 0
          ? (memberRows as { id: string; user_id: string | null }[])[0] : null
        if (member) {
          staffMemberId = member.id
          userId = member.user_id ?? null
        }
      }
    }

    if (!staffMemberId) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

    const [overtimeRes, leaveRes, breakRes] = await Promise.all([
      // 残業申請（users.id が必要）
      userId
        ? adminClient
            .from('overtime_requests')
            .select('id, date, actual_end_time, status')
            .eq('staff_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .eq('request_type', 'pre')
        : Promise.resolve({ data: [] }),

      // 有給使用（users.id が必要）
      userId
        ? adminClient
            .from('paid_leave_usages')
            .select('id, date, days_used')
            .eq('staff_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
        : Promise.resolve({ data: [] }),

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

    return NextResponse.json({
      overtimeRequests: overtimeRes.data ?? [],
      leaveUsages: leaveRes.data ?? [],
      breakRecords,
    })
  } catch (err) {
    console.error('[liff/staff/month-data]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
