import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_HOURS_PER_DAY, fiscalYearRange } from '@/lib/paid-leave'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = request.nextUrl.searchParams.get('staff_id')
  const year = parseInt(request.nextUrl.searchParams.get('year') ?? '0')
  if (!staffId || !year) return NextResponse.json({ error: 'staff_id and year are required' }, { status: 400 })

  const { start, end } = fiscalYearRange(year)

  const [grantsRes, usagesRes, staffRes] = await Promise.all([
    supabase
      .from('paid_leave_grants')
      .select('id, staff_id, year, total_days, note')
      .eq('staff_id', staffId)
      .eq('year', year),
    supabase
      .from('paid_leave_usages')
      .select('id, staff_id, date, unit, days_used, hours_used, note')
      .eq('staff_id', staffId)
      .gte('date', start)
      .lte('date', end)
      .order('date'),
    supabase
      .from('staff_members')
      .select('paid_leave_hours_per_day')
      .eq('id', staffId)
      .single(),
  ])

  const hoursPerDay = (staffRes.data as { paid_leave_hours_per_day: number | null } | null)
    ?.paid_leave_hours_per_day ?? DEFAULT_HOURS_PER_DAY

  return NextResponse.json({
    grants: grantsRes.data ?? [],
    usages: usagesRes.data ?? [],
    hoursPerDay,
  })
}
