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
    date: string
    scheduled_end_time: string | null
    actual_end_time: string | null
    overtime_minutes: number
    request_type: 'pre' | 'auto'
    status: 'pending' | 'approved' | 'rejected'
    note?: string
  }

  const { staff_id, date, scheduled_end_time, actual_end_time, overtime_minutes, request_type, status, note } = body

  const upsertData = {
    staff_id,
    date,
    scheduled_end_time: scheduled_end_time ?? null,
    actual_end_time: actual_end_time ?? null,
    overtime_minutes,
    request_type,
    status,
    note: note ?? null,
    ...(status === 'approved' ? { approved_by: user.id, approved_at: new Date().toISOString() } : {}),
  }

  const { data, error } = await supabase
    .from('overtime_requests')
    .upsert(upsertData, { onConflict: 'staff_id,date,request_type' })
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
