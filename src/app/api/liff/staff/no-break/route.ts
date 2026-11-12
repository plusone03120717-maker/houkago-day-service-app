import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * 「休憩なし」の申請（昼休憩をとれなかった日）。
 * 残業申請の表に request_type = 'no_break' で入れる。その日は昼休憩の60分を勤務時間から引かない。
 * 残業申請と同じく自動で承認し、管理画面のスタッフ申請に未確認として出す。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, date } = await req.json() as { accessToken?: string; date?: string }
    if (!accessToken || !date) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: staffRows } = await adminClient
      .from('staff_members')
      .select('id')
      .eq('line_user_id', lineUserId)
      .limit(1)
    const staffMember = staffRows && (staffRows as { id: string }[]).length > 0
      ? (staffRows as { id: string }[])[0] : null
    if (!staffMember) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 403 })
    }

    const { error } = await adminClient.from('overtime_requests').insert({
      staff_id: staffMember.id,
      date,
      overtime_minutes: 60,
      request_type: 'no_break',
      status: 'approved',
      is_new: true,
      note: '昼休憩をとれなかった',
      source: 'line',
    } as never)

    if (error) {
      const message = error.code === '23505'
        ? 'この日の休憩なしはすでに申請されています'
        : '登録に失敗しました'
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/staff/no-break]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
