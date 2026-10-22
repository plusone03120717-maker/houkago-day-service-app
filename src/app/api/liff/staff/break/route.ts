import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { pairBreakRecords } from '@/lib/work-time'
import { DATE_RE, TIME_RE, MAX_BREAK_DAYS, timeRangesOverlap } from '@/lib/break-requests'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * LINE から中抜けを申請する。
 * date（1日）か dates（曜日・期間でまとめて申請）のどちらかを受け付ける。
 * すでに時間が重なる中抜けがある日は、二重に引かないよう飛ばす。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, date, dates, startTime, endTime } = await req.json() as {
      accessToken?: string; date?: string; dates?: string[]; startTime?: string; endTime?: string
    }
    const targetDates = Array.from(new Set(dates ?? (date ? [date] : []))).sort()
    if (!accessToken || targetDates.length === 0 || !startTime || !endTime) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (targetDates.some((d) => !DATE_RE.test(d))) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }
    if (targetDates.length > MAX_BREAK_DAYS) {
      return NextResponse.json({ error: `一度に申請できるのは${MAX_BREAK_DAYS}日分までです` }, { status: 400 })
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return NextResponse.json({ error: '時刻の形式が正しくありません' }, { status: 400 })
    }
    if (startTime >= endTime) {
      return NextResponse.json({ error: '開始時刻は終了時刻より前にしてください' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    // 対象期間にある本人の中抜けを読み、時間が重なる日は飛ばす
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
      console.error('[liff/staff/break] read error:', JSON.stringify(readError))
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }
    const existing = pairBreakRecords((existingRaw ?? []) as { id: string; type: string; recorded_at: string }[])

    const skipped: string[] = []
    const rows: Record<string, unknown>[] = []
    for (const d of targetDates) {
      const clash = (existing.get(d) ?? []).some((p) =>
        timeRangesOverlap(startTime, endTime, p.start ?? '00:00', p.end ?? '23:59'),
      )
      if (clash) { skipped.push(d); continue }
      rows.push(
        // 管理者の「スタッフ申請」に出すのは開始の行だけ（is_new=true）
        { staff_member_id: staff.staffMemberId, type: 'break_start', recorded_at: new Date(`${d}T${startTime}:00+09:00`).toISOString(), is_new: true },
        { staff_member_id: staff.staffMemberId, type: 'break_end', recorded_at: new Date(`${d}T${endTime}:00+09:00`).toISOString(), is_new: false },
      )
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'どの日もすでに同じ時間帯の中抜けが申請されています' }, { status: 409 })
    }

    const { error } = await adminClient.from('time_records').insert(rows as never)
    if (error) {
      console.error('[liff/staff/break] insert error:', JSON.stringify(error))
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, created: rows.length / 2, skipped })
  } catch (err) {
    console.error('[liff/staff/break]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
