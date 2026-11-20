import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { logStaffView } from '@/lib/line/log-staff-view'
import { loadStaffEvents } from '@/lib/line/staff-events'

/**
 * スタッフ LINE の「会議・予定」タブ。from の日から days 日分の予定（会議・モニタリング・行事・外部・その他）を、
 * 全員分まとめて返す（見るだけ）。自分が参加に入っている予定には mine を付ける。
 * 参加スタッフが0人の予定は「全員」の予定。
 */

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 120

function addDays(dateStr: string, diff: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + diff))
  return dt.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, from, days } = await req.json() as { accessToken?: string; from?: string; days?: number }
    if (!accessToken || !from || !DATE_RE.test(from)) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }
    const span = Math.min(Math.max(Math.floor(Number(days) || 30), 1), MAX_DAYS)
    const to = addDays(from, span - 1)

    const lineUserId = await verifyLineAccessToken(accessToken)
    const staff = await findStaffByLineUserId(adminClient, lineUserId)
    if (!staff) {
      return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
    }

    await logStaffView(adminClient, staff.staffMemberId, 'staff-events', from)

    const events = await loadStaffEvents(adminClient, staff.userId, from, to)

    return NextResponse.json({ staff: { name: staff.name }, from, to, events })
  } catch (err) {
    console.error('[liff/staff/schedule/events]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
