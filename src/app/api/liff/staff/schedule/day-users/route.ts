import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { loadDayUsers } from '@/lib/day-users'

/**
 * スタッフ LINE の「会議・予定」のカレンダーで日を押したときに出す、その日の利用者（見るだけ）。
 * 顔ぶれはダッシュボードの「本日の利用予定」・出席管理と同じ判定（lib/day-users）。
 */

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date } = await req.json() as { accessToken?: string; date?: string }
    if (!accessToken || !date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    const { users, absent } = await loadDayUsers(adminClient, date)
    return NextResponse.json({ date, users, absent })
  } catch (err) {
    console.error('[liff/staff/schedule/day-users]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
