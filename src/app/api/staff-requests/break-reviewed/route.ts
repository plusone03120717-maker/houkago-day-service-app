import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasMoneyAccess } from '@/lib/require-admin'

/** 中抜け申請を確認済みにする。まとめて申請した分は ids でまとめて受け付ける */
export async function POST(req: NextRequest) {
  if (!(await hasMoneyAccess())) {
    return NextResponse.json({ error: '請求・給与はシステム管理者だけが扱えます' }, { status: 403 })
  }
  try {
    const { id, ids } = await req.json() as { id?: string; ids?: string[] }
    const targets = ids ?? (id ? [id] : [])
    if (targets.length === 0) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

    const supabase = await createClient()
    const { error } = await supabase
      .from('time_records')
      .update({ is_new: false })
      .eq('type', 'break_start')
      .in('id', targets)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[staff-requests/break-reviewed]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
