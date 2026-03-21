import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function generateLoginCode(): string {
  // 読みやすい6文字の英数字コード（O/0, I/1/l は除外）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ登録できます' }, { status: 403 })
  }

  const body = await request.json()
  const { name, childId, password } = body as { name: string; childId: string; password: string }

  if (!name || !childId || !password) {
    return NextResponse.json({ error: 'name, childId, password は必須です' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // この児童にすでに保護者アカウントが紐付いているか確認（複数でも対応）
  const { data: existingLinks } = await adminClient
    .from('parent_children')
    .select('user_id')
    .eq('child_id', childId)

  if (existingLinks && existingLinks.length > 0) {
    // 既存アカウント全てのパスワードを更新
    for (const link of existingLinks) {
      await adminClient.auth.admin.updateUserById(link.user_id, { password })
    }
    return NextResponse.json({ success: true })
  }

  // 新規登録：ユニークなログインコードを生成してメールアドレス代わりに使用
  let loginCode = generateLoginCode()
  let email = `${loginCode}@parent.local`

  // 万一衝突したら再生成
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await adminClient
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (!existing) break
    loginCode = generateLoginCode()
    email = `${loginCode}@parent.local`
    attempts++
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'parent' },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userId = data.user.id
  await adminClient.from('users').upsert({ id: userId, name, email, role: 'parent' })
  await adminClient.from('parent_children').upsert({ user_id: userId, child_id: childId })

  return NextResponse.json({ success: true })
}
