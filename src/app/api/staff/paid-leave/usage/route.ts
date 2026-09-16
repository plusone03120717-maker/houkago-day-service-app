import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_HOURS_PER_DAY } from '@/lib/paid-leave'
import { normalizeLeaveInput, validateLeaveUsage } from '@/lib/paid-leave-server'

const SELECT_COLS = 'id, staff_id, date, unit, days_used, hours_used, note'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })

  const body = await request.json() as {
    id?: string
    staff_id: string
    date: string
    unit?: string
    days_used?: number
    hours?: number
    note?: string | null
  }

  if (!body.staff_id || !body.date) {
    return NextResponse.json({ error: 'staff_id と date は必須です' }, { status: 400 })
  }

  const { data: staffRow } = await supabase
    .from('staff_members')
    .select('paid_leave_hours_per_day')
    .eq('id', body.staff_id)
    .single()
  const hoursPerDay = (staffRow as { paid_leave_hours_per_day: number | null } | null)
    ?.paid_leave_hours_per_day ?? DEFAULT_HOURS_PER_DAY

  const normalized = normalizeLeaveInput(
    { unit: body.unit, daysUsed: body.days_used, hours: body.hours },
    hoursPerDay,
  )
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }
  const { input } = normalized

  const conflict = await validateLeaveUsage(supabase, {
    staffId: body.staff_id,
    date: body.date,
    input,
    hoursPerDay,
    excludeId: body.id ?? null,
  })
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 })

  const row = {
    staff_id: body.staff_id,
    date: body.date,
    unit: input.unit,
    days_used: input.daysUsed,
    hours_used: input.hoursUsed,
    note: body.note ?? null,
  }

  const query = body.id
    ? supabase.from('paid_leave_usages').update(row as never).eq('id', body.id).select(SELECT_COLS).single()
    : supabase.from('paid_leave_usages').insert(row as never).select(SELECT_COLS).single()

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase.from('paid_leave_usages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
