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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // まず新規招待を試みる
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    { data: { name, role: 'parent' }, redirectTo }
  )

  if (inviteError) {
    // 既存ユーザーの場合はパスワードリセットメールで再送
    const isAlreadyRegistered =
      inviteError.message.includes('already been registered') ||
      inviteError.message.includes('already registered') ||
      (inviteError as { status?: number }).status === 422

    if (!isAlreadyRegistered) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    // 既存ユーザーのIDを取得して parent_children を更新
    const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = usersData?.users?.find((u) => u.email === email)
    if (existingUser) {
      await adminClient.from('users').upsert({ id: existingUser.id, name, email, role: 'parent' })
      await adminClient.from('parent_children').upsert({ user_id: existingUser.id, child_id: childId })
    }

    // パスワードリセットメールを送信（再招待として利用）
    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo })
    if (resetError) {
      return NextResponse.json({ error: 'メールの再送に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true, resent: true })
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
