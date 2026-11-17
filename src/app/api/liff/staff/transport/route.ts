import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { logStaffView } from '@/lib/line/log-staff-view'
import { loadLiffTransport } from '@/lib/liff-transport'

/**
 * スタッフ LINE の「全体」タブ：その日の送迎管理（全ユニットまとめて）を閲覧だけする。
 * 中身の組み立ては @/lib/liff-transport（便ごとの一覧と、送迎なしの子）。
 */

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  try {
    const { accessToken, date } = await req.json() as { accessToken?: string; date?: string }
    if (!accessToken || !date) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: '日付の形式が不正です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    await logStaffView(adminClient, staff.staffMemberId, 'staff-transport', date)

    const { trips, noTransport } = await loadLiffTransport(adminClient, staff.staffMemberId, date)
    return NextResponse.json({ date, trips, noTransport })
  } catch (err) {
    console.error('[liff/staff/transport]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
