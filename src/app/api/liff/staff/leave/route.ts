import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date, daysUsed } = await req.json() as {
      accessToken?: string; date?: string; daysUsed?: number
    }
    if (!accessToken || !date || daysUsed === undefined) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }
    if (daysUsed !== 0.5 && daysUsed !== 1.0) {
      return NextResponse.json({ error: '日数は 0.5 か 1.0 のみ指定できます' }, { status: 400 })
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

    const { error } = await adminClient.from('paid_leave_usages').insert({
      staff_id: staffMemberId,
      date,
      days_used: daysUsed,
      note: 'LINEアプリから申請',
    } as never)

    if (error) {
      const message = error.code === '23505'
        ? 'この日の有給申請はすでに登録されています'
        : '登録に失敗しました'
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/staff/leave]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
