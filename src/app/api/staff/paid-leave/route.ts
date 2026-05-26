import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staffId = request.nextUrl.searchParams.get('staff_id')
  const year = parseInt(request.nextUrl.searchParams.get('year') ?? '0')
  if (!staffId || !year) return NextResponse.json({ error: 'staff_id and year are required' }, { status: 400 })

  const usageStart = `${year}-04-01`
  const usageEnd = `${year + 1}-03-31`

  const [grantsRes, usagesRes] = await Promise.all([
    supabase
      .from('paid_leave_grants')
      .select('id, staff_id, year, total_days, note')
      .eq('staff_id', staffId)
      .eq('year', year),
    supabase
      .from('paid_leave_usages')
      .select('id, staff_id, date, days_used, note')
      .eq('staff_id', staffId)
      .gte('date', usageStart)
      .lte('date', usageEnd)
      .order('date'),
  ])

  return NextResponse.json({
    grants: grantsRes.data ?? [],
    usages: usagesRes.data ?? [],
  })
}
