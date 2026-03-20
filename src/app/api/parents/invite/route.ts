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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectTo = `${appUrl}/auth/callback?next=/set-password`

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { flowType: 'implicit', autoRefreshToken: false, persistSession: false } }
  )

  // 既存ユーザーかどうかを先に確認
  const { data: existingInTable } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingInTable) {
    // 既存ユーザー → parent_children を更新してパスワードリセットメールで再招待
    await adminClient.from('users').upsert({ id: existingInTable.id, name, email, role: 'parent' })
    await adminClient.from('parent_children').upsert({ user_id: existingInTable.id, child_id: childId })

    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo })
    if (resetError) {
      return NextResponse.json({ error: 'メールの再送に失敗しました: ' + resetError.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, resent: true })
  }

  // 新規ユーザー → 招待メール送信
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { data: { name, role: 'parent' }, redirectTo }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  if (inviteData?.user) {
    await adminClient.from('users').upsert({
      id: inviteData.user.id,
      name,
      email,
      role: 'parent',
    })
    await adminClient.from('parent_children').upsert({
      user_id: inviteData.user.id,
      child_id: childId,
    })
  }

  return NextResponse.json({ success: true })
}
