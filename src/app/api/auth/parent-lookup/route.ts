import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const { childName } = await request.json() as { childName: string }
  if (!childName?.trim()) {
    return NextResponse.json({ error: 'お子さんの名前を入力してください' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // スペース（全角・半角）を除去して正規化
  const normalize = (s: string) => s.replace(/[\s　]/g, '')
  const normalizedInput = normalize(childName.trim())

  // まず全件取得してスペース無視で比較
  const { data: allChildren } = await adminClient
    .from('children')
    .select('id, name')

  const children = (allChildren ?? []).filter(
    (c: { id: string; name: string }) =>
      normalize(c.name).toLowerCase() === normalizedInput.toLowerCase()
  )

  if (children.length === 0) {
    return NextResponse.json({ error: 'お子さんの名前が見つかりません' }, { status: 404 })
  }

  const childIds = children.map((c: { id: string }) => c.id)

  const { data: links } = await adminClient
    .from('parent_children')
    .select('user_id')
    .in('child_id', childIds)

  if (!links || links.length === 0) {
    return NextResponse.json({ error: 'この児童に紐付いた保護者アカウントがありません' }, { status: 404 })
  }

  const userIds = links.map((l: { user_id: string }) => l.user_id)

  const { data: users } = await adminClient
    .from('users')
    .select('email')
    .in('id', userIds)
    .eq('role', 'parent')
    .order('created_at', { ascending: true })

  if (!users || users.length === 0) {
    return NextResponse.json({ error: '保護者アカウントが見つかりません' }, { status: 404 })
  }

  // 保護者が複数いる場合は最初の1件を使用
  return NextResponse.json({ email: users[0].email })
}
