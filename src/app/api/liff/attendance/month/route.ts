import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { accessToken, year, month } = await req.json() as {
      accessToken?: string; year?: number; month?: number
    }
    if (!accessToken || !year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: guardian } = await adminClient
      .from('guardians')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (!guardian) {
      return NextResponse.json({ children: [], contacts: [] })
    }

    const { data: rows } = await adminClient
      .from('guardian_children')
      .select('children (id, name)')
      .eq('guardian_id', guardian.id)

    const children = (rows ?? [])
      .flatMap((r) => (Array.isArray(r.children) ? r.children : r.children ? [r.children] : []))
      .filter((c): c is { id: string; name: string } => c !== null && typeof c.id === 'string')

    if (children.length === 0) {
      return NextResponse.json({ children: [], contacts: [] })
    }

    const mm = String(month).padStart(2, '0')
    const lastDay = new Date(year, month, 0).getDate()
    const { data: contacts } = await adminClient
      .from('parent_attendance_contacts')
      .select('child_id, date, status, service_type, pickup_required, note')
      .in('child_id', children.map((c) => c.id))
      .gte('date', `${year}-${mm}-01`)
      .lte('date', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)

    return NextResponse.json({ children, contacts: contacts ?? [] })
  } catch (err) {
    console.error('[liff/attendance/month]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
