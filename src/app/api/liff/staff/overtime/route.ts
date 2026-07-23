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

    // ユーザーID取得
    let userId: string | null = null
    const { data: staffRow } = await adminClient
      .from('staff_members')
      .select('user_id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (staffRow) {
      userId = (staffRow as { user_id: string | null }).user_id
    } else {
      const { data: linkedUser } = await adminClient
        .from('users')
        .select('id')
        .eq('line_user_id', lineUserId)
        .maybeSingle()
      if (linkedUser) userId = (linkedUser as { id: string }).id
    }

    if (!userId) {
      return NextResponse.json({ error: 'スタッフが見つかりません、またはアカウント未登録です' }, { status: 403 })
    }

    const { error } = await adminClient.from('overtime_requests').insert({
      staff_id: userId,
      date,
      actual_end_time: `${endTime}:00`,
      request_type: 'pre',
      status: 'pending',
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
