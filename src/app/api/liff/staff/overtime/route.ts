import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date, endTime } = await req.json() as {
      accessToken?: string; date?: string; endTime?: string
    }
    if (!accessToken || !date || !endTime) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: staffRows } = await adminClient
      .from('staff_members')
      .select('id, user_id')
      .eq('line_user_id', lineUserId)
      .limit(1)
    const staffMember = staffRows && (staffRows as { id: string; user_id: string | null }[]).length > 0
      ? (staffRows as { id: string; user_id: string | null }[])[0] : null

    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 403 })
    }

    // シフト管理に登録された予定退勤時刻との差分から残業分数を自動計算する
    // （従来はここが未実装で overtime_minutes が常に0のまま登録され、
    //   タイムカードの残業集計・スタッフ申請一覧に反映されていなかった）
    let scheduledEndTime: string | null = null
    let overtimeMinutes = 0
    if (staffMember.user_id) {
      const { data: shiftRows } = await adminClient
        .from('staff_shifts')
        .select('end_time')
        .eq('staff_id', staffMember.user_id)
        .eq('date', date)
        .limit(1)
      const shift = shiftRows && (shiftRows as { end_time: string | null }[]).length > 0
        ? (shiftRows as { end_time: string | null }[])[0] : null
      if (shift?.end_time) {
        scheduledEndTime = shift.end_time
        const diffMinutes = toMinutes(endTime) - toMinutes(shift.end_time)
        // 30分単位に切り捨て（他の残業申請経路と同じ丸め方に統一）
        if (diffMinutes > 0) overtimeMinutes = Math.floor(diffMinutes / 30) * 30
      }
    }

    const { error } = await adminClient.from('overtime_requests').insert({
      staff_id: staffMember.id,
      date,
      scheduled_end_time: scheduledEndTime,
      actual_end_time: `${endTime}:00`,
      overtime_minutes: overtimeMinutes,
      request_type: 'pre',
      status: 'approved',
      is_new: true,
      note: 'LINEアプリから申請',
    } as never)

    if (error) {
      const message = error.code === '23505'
        ? 'この日の残業申請はすでに登録されています'
        : '登録に失敗しました'
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/staff/overtime]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
