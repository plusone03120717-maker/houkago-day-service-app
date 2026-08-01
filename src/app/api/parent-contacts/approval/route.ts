import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STATUSES = ['pending', 'approved', 'rejected'] as const
type ApprovalStatus = (typeof STATUSES)[number]

// 利用（予約）連絡の承認/非承認を記録する。
// 承認・非承認したものは確認済み扱いにしてベルバッジから外す。
// pending に戻した場合は未確認へ戻し、再検討できるようにする。
export async function POST(req: NextRequest) {
  try {
    const { id, approvalStatus } = await req.json() as {
      id?: string
      approvalStatus?: ApprovalStatus
    }
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
    if (!approvalStatus || !STATUSES.includes(approvalStatus)) {
      return NextResponse.json({ error: 'approvalStatus が正しくありません' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('parent_attendance_contacts')
      .update({
        approval_status: approvalStatus,
        is_new: approvalStatus === 'pending',
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[parent-contacts/approval]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
