import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { pairBreakRecords } from '@/lib/work-time'
import { DATE_RE, TIME_RE, MAX_BREAK_DAYS } from '@/lib/break-requests'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * LINEから申請した中抜けを取り消す（開始・終了の行ごと削除）。
 * dates と startTime・endTime を指定すると、その日々の「同じ時間の中抜け」だけを消す。
 * 1日だけ消すときも dates に1日を入れる。削除対象は必ず本人（staff_members.id）の記録に限る。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, dates, startTime, endTime } = await req.json() as {
      accessToken?: string; dates?: string[]; startTime?: string; endTime?: string
    }
    const targetDates = Array.from(new Set(dates ?? [])).sort()
    if (!accessToken || targetDates.length === 0 || !startTime || !endTime) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (targetDates.some((d) => !DATE_RE.test(d))) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }
    if (targetDates.length > MAX_BREAK_DAYS) {
      return NextResponse.json({ error: `一度に取り消せるのは${MAX_BREAK_DAYS}日分までです` }, { status: 400 })
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return NextResponse.json({ error: '時刻の形式が正しくありません' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 403 })
    }

    const first = targetDates[0]
    const last = targetDates[targetDates.length - 1]
    const { data: existingRaw, error: readError } = await adminClient
      .from('time_records')
      .select('id, type, recorded_at')
      .eq('staff_member_id', staff.staffMemberId)
      .in('type', ['break_start', 'break_end'])
      .gte('recorded_at', new Date(`${first}T00:00:00+09:00`).toISOString())
      .lte('recorded_at', new Date(`${last}T23:59:59+09:00`).toISOString())
    if (readError) {
      console.error('[liff/staff/break/cancel] read error:', JSON.stringify(readError))
      return NextResponse.json({ error: '取り消しに失敗しました' }, { status: 500 })
    }

    const byDate = pairBreakRecords((existingRaw ?? []) as { id: string; type: string; recorded_at: string }[])
    const ids: string[] = []
    let count = 0
    for (const d of targetDates) {
      for (const p of byDate.get(d) ?? []) {
        if (p.start !== startTime || p.end !== endTime) continue
        if (p.startId) ids.push(p.startId)
        if (p.endId) ids.push(p.endId)
        count++
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'この条件の中抜け申請は見つかりませんでした' }, { status: 404 })
    }

    const { error } = await adminClient
      .from('time_records')
      .delete()
      .eq('staff_member_id', staff.staffMemberId)
      .in('id', ids)
    if (error) {
      console.error('[liff/staff/break/cancel] delete failed', error)
      return NextResponse.json({ error: '取り消しに失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cancelled: count })
  } catch (err) {
    console.error('[liff/staff/break/cancel]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
