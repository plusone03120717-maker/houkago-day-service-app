import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 保護者の利用連絡を確認済みにする。
// id を渡すと1件、ids を渡すと複数件をまとめて確認済みにする。
export async function POST(req: NextRequest) {
  try {
    const { id, ids } = await req.json() as { id?: string; ids?: string[] }
    const targetIds = ids ?? (id ? [id] : [])
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'id または ids が必要です' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('parent_attendance_contacts')
      .update({ is_new: false })
      .in('id', targetIds)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[parent-contacts/reviewed]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
