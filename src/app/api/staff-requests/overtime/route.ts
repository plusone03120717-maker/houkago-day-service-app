import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json() as { id?: string; status?: string }
    if (!id || !['approved', 'rejected'].includes(status ?? '')) {
      return NextResponse.json({ error: 'パラメータが不正です' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('overtime_requests')
      .update({ status })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[staff-requests/overtime]', err)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
