import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { findStaffByLineUserId } from '@/lib/line/liff-staff'
import { normalizeLeaveInput, validateLeaveUsage } from '@/lib/paid-leave-server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      accessToken?: string; date?: string; unit?: string; daysUsed?: number; hours?: number
    }
    const { accessToken, date } = body

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

    const normalized = normalizeLeaveInput(body, staff.hoursPerDay)
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    const { input } = normalized

    const conflict = await validateLeaveUsage(adminClient, {
      staffId: staff.staffMemberId,
      date,
      input,
      hoursPerDay: staff.hoursPerDay,
    })
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 })
    }

    const { error } = await adminClient.from('paid_leave_usages').insert({
      staff_id: staff.staffMemberId,
      date,
      unit: input.unit,
      days_used: input.daysUsed,
      hours_used: input.hoursUsed,
      note: 'LINEアプリから申請',
      is_new: true,
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
