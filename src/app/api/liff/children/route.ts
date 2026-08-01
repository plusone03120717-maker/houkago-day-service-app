import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json() as { accessToken?: string }
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: guardian } = await adminClient
      .from('guardians')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()

    if (!guardian) {
      return NextResponse.json({ children: [] })
    }

    const { data: rows } = await adminClient
      .from('guardian_children')
      .select('children (id, name)')
      .eq('guardian_id', guardian.id)

    const children = (rows ?? [])
      .flatMap((r) => (Array.isArray(r.children) ? r.children : r.children ? [r.children] : []))
      .filter((c): c is { id: string; name: string } => c !== null && typeof c.id === 'string')

    return NextResponse.json({ children })
  } catch (err) {
    console.error('[liff/children]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
