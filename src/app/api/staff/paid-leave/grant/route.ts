import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })

  const body = await request.json() as {
    staff_id: string
    year: number
    total_days: number
    note?: string | null
  }

  const { data, error } = await supabase
    .from('paid_leave_grants')
    .upsert({
      staff_id: body.staff_id,
      year: body.year,
      total_days: body.total_days,
      note: body.note ?? null,
    }, { onConflict: 'staff_id,year' })
    .select('id, staff_id, year, total_days, note')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
