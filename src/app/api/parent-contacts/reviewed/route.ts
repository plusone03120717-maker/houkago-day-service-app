import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUserId } from '@/lib/auth'
import {
  PARENT_CONTACT_COLUMNS,
  applyParentContact,
  type ParentContact,
  type AbsentHandling,
} from '@/lib/parent-contact-schedule'

const HANDLINGS: AbsentHandling[] = ['absent', 'delete']

// 保護者の利用連絡を確認済みにする。
// id を渡すと1件、ids を渡すと複数件をまとめて確認済みにする。
//
// キャンセルの連絡は、確認と同時にその日の予定に反映する。
// handling でどちらにするかをスタッフが選ぶ:
//   absent … 欠席として記録する。予約・利用計画は残るので出席管理には欠席として出続け、
//            国保連請求の欠席時対応加算も算定できる（前日・当日の急なお休み向け）
//   delete … その日の予定をなかったことにする（ずっと前からのキャンセル向け）
// （利用の連絡は承認が必要なので /api/parent-contacts/approval 側で反映する）
export async function POST(req: NextRequest) {
  try {
    const { id, ids, handling, absenceReason } = await req.json() as {
      id?: string
      ids?: string[]
      handling?: AbsentHandling
      /** 欠席として記録するときの欠席理由（スタッフがその場で書いたもの） */
      absenceReason?: string
    }
    const targetIds = ids ?? (id ? [id] : [])
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'id または ids が必要です' }, { status: 400 })
    }
    if (handling !== undefined && !HANDLINGS.includes(handling)) {
      return NextResponse.json({ error: 'handling が正しくありません' }, { status: 400 })
    }

    const supabase = await createClient()
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data: contactsRaw } = await supabase
      .from('parent_attendance_contacts')
      .select(PARENT_CONTACT_COLUMNS)
      .in('id', targetIds)
    const contacts = (contactsRaw ?? []) as unknown as ParentContact[]

    const { error } = await supabase
      .from('parent_attendance_contacts')
      .update({ is_new: false })
      .in('id', targetIds)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // キャンセルの連絡だけ予定に反映する。
    // 反映できなかったもの（もともと予定が無い日など）は理由を返して画面で知らせる。
    // まとめて確認したときに「どの連絡が反映されたか」が分かるよう、件ごとに結果を返す。
    const results: { id: string; applied: boolean; handling?: AbsentHandling; error?: string }[] = []
    for (const contact of contacts) {
      if (contact.status !== 'absent') continue
      const result = await applyParentContact(
        supabase,
        contact,
        userId,
        undefined,
        handling,
        typeof absenceReason === 'string' ? absenceReason : undefined
      )
      results.push({
        id: contact.id,
        applied: !result.error,
        handling: handling ?? 'absent',
        error: result.error,
      })
    }

    const warnings = [...new Set(results.map((r) => r.error).filter((e): e is string => !!e))]
    return NextResponse.json({ ok: true, results, warnings })
  } catch (err) {
    console.error('[parent-contacts/reviewed]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
