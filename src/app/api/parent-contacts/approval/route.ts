import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import {
  PARENT_CONTACT_COLUMNS,
  applyParentContact,
  revertParentContact,
  type ParentContact,
} from '@/lib/parent-contact-schedule'

const STATUSES = ['pending', 'approved', 'rejected'] as const
type ApprovalStatus = (typeof STATUSES)[number]

// 利用（予約）連絡の承認/非承認を記録する。
// 承認・非承認したものは確認済み扱いにしてベルバッジから外す。
// pending に戻した場合は未確認へ戻し、再検討できるようにする。
//
// 承認したときは、その連絡を実際の利用予定（usage_reservations）へ反映する。
// 非承認・未承認に戻したときは、その反映を取り消す。
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
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data: contactRaw, error: fetchError } = await supabase
      .from('parent_attendance_contacts')
      .select(PARENT_CONTACT_COLUMNS)
      .eq('id', id)
      .single()
    if (fetchError || !contactRaw) {
      return NextResponse.json({ error: '連絡が見つかりません' }, { status: 404 })
    }
    const contact = contactRaw as unknown as ParentContact

    const { error } = await supabase
      .from('parent_attendance_contacts')
      .update({
        approval_status: approvalStatus,
        is_new: approvalStatus === 'pending',
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 予定への反映。反映に失敗しても承認の記録そのものは残す（スタッフが
    // 利用状況画面で手当てできるよう、理由だけ warning として返す）
    const result =
      approvalStatus === 'approved'
        ? await applyParentContact(supabase, contact, userId)
        : await revertParentContact(supabase, contact)

    return NextResponse.json({ ok: true, warning: result.error })
  } catch (err) {
    console.error('[parent-contacts/approval]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
