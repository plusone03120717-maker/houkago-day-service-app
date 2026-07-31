import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
      .select('id')
      .eq('line_user_id', lineUserId)
      .limit(1)
    const staffMemberId = staffRows && (staffRows as { id: string }[]).length > 0
      ? (staffRows as { id: string }[])[0].id : null

    if (!staffMemberId) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 403 })
    }

    const { error } = await adminClient.from('overtime_requests').insert({
      staff_id: staffMemberId,
      date,
      actual_end_time: `${endTime}:00`,
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
