import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineIdToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { idToken, date, daysUsed } = await req.json() as {
      idToken?: string; date?: string; daysUsed?: number
    }
    if (!idToken || !date || daysUsed === undefined) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }
    if (daysUsed !== 0.5 && daysUsed !== 1.0) {
      return NextResponse.json({ error: '日数は 0.5 か 1.0 のみ指定できます' }, { status: 400 })
    }

    const lineUserId = await verifyLineIdToken(idToken)

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

    const { error } = await adminClient.from('paid_leave_usages').insert({
      staff_id: userId,
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
