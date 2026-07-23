import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date, startTime, endTime } = await req.json() as {
      accessToken?: string; date?: string; startTime?: string; endTime?: string
    }
    if (!accessToken || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }
    if (startTime >= endTime) {
      return NextResponse.json({ error: '開始時刻は終了時刻より前にしてください' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    let staffMemberId: string | null = null
    const { data: staffRows } = await adminClient
      .from('staff_members')
      .select('id')
      .eq('line_user_id', lineUserId)
      .limit(1)
    const staffRow = staffRows && (staffRows as { id: string }[]).length > 0
      ? (staffRows as { id: string }[])[0] : null

    if (staffRow) {
      staffMemberId = staffRow.id
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
          .select('id')
          .eq('user_id', linkedUser.id)
          .limit(1)
        const member = memberRows && (memberRows as { id: string }[]).length > 0 ? (memberRows as { id: string }[])[0] : null
        if (member) staffMemberId = member.id
      }
    }

    if (!staffMemberId) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    const breakStartAt = new Date(`${date}T${startTime}:00+09:00`).toISOString()
    const breakEndAt = new Date(`${date}T${endTime}:00+09:00`).toISOString()

    const { error } = await adminClient.from('time_records').insert([
      { staff_member_id: staffMemberId, type: 'break_start', recorded_at: breakStartAt, is_new: true },
      { staff_member_id: staffMemberId, type: 'break_end', recorded_at: breakEndAt, is_new: false },
    ] as never)

    if (error) {
      console.error('[liff/staff/break] insert error:', JSON.stringify(error))
      return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/staff/break]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
