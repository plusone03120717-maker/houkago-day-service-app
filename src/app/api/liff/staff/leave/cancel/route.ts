import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * LINEから申請した有給を取り消す（レコードごと削除）。
 * 削除対象は必ず「本人（staff_members.id）の指定日」に限定する。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, date } = await req.json() as {
      accessToken?: string; date?: string
    }
    if (!accessToken || !date) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '日付の形式が正しくありません' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)

    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 403 })
    }

    const { data, error } = await adminClient
      .from('paid_leave_usages')
      .delete()
      .eq('staff_id', staff.staffMemberId)
      .eq('date', date)
      .select('id')

    if (error) {
      console.error('[liff/staff/leave/cancel] delete failed', error)
      return NextResponse.json({ error: '取り消しに失敗しました' }, { status: 500 })
    }

    if (!data || (data as { id: string }[]).length === 0) {
      return NextResponse.json({ error: 'この日の有給申請は見つかりませんでした' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[liff/staff/leave/cancel]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
