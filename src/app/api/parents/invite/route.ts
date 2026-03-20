import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者権限チェック
  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ招待できます' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, childId } = body as { email: string; name: string; childId: string }
  if (!email || !name || !childId) {
    return NextResponse.json({ error: 'email, name, childId は必須です' }, { status: 400 })
  }

  const { password } = body as { email: string; name: string; childId: string; password?: string }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 既存ユーザー確認
  const { data: existingInTable } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let userId: string

  if (existingInTable) {
    // 既存ユーザー → パスワードを更新
    userId = existingInTable.id
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await adminClient.from('users').upsert({ id: userId, name, email, role: 'parent' })
  } else {
    // 新規ユーザー → 直接作成
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'parent' },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    userId = data.user.id
    await adminClient.from('users').upsert({ id: userId, name, email, role: 'parent' })
  }

  await adminClient.from('parent_children').upsert({ user_id: userId, child_id: childId })

  return NextResponse.json({ success: true })
}
