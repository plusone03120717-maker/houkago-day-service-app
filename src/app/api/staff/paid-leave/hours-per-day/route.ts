import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** 時間単位年休の「1日分の時間数」（労使協定で定める所定労働時間・端数切り上げ）を設定する */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })

  const body = await request.json() as { staff_id?: string; hours_per_day?: number }
  const hours = Number(body.hours_per_day)

  if (!body.staff_id) return NextResponse.json({ error: 'staff_id は必須です' }, { status: 400 })
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    return NextResponse.json({ error: '1日分の時間数は1〜24の整数で指定してください' }, { status: 400 })
  }

  const { error } = await supabase
    .from('staff_members')
    .update({ paid_leave_hours_per_day: hours } as never)
    .eq('id', body.staff_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, hoursPerDay: hours })
}
