import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json() as { id?: string }
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

    const supabase = await createClient()
    const { error } = await supabase
      .from('paid_leave_usages')
      .update({ is_new: false })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[staff-requests/leave-reviewed]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
