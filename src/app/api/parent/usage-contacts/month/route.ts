import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import { loadUsageContacts } from '@/lib/parent-usage-contact'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** 保護者ポータルの利用連絡カレンダー：その月の連絡とお子さま一覧を返す */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { year, month } = await req.json() as { year?: number; month?: number }
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const { data: rows } = await adminClient
      .from('parent_children')
      .select('children (id, name)')
      .eq('user_id', userId)

    const children = ((rows ?? []) as unknown as {
      children: { id: string; name: string } | null
    }[])
      .map((r) => r.children)
      .filter((c): c is { id: string; name: string } => c !== null)

    if (children.length === 0) {
      return NextResponse.json({ children: [], contacts: [] })
    }

    const contacts = await loadUsageContacts(
      adminClient,
      children.map((c) => c.id),
      year,
      month
    )

    return NextResponse.json({ children, contacts })
  } catch (err) {
    console.error('[parent/usage-contacts/month]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
