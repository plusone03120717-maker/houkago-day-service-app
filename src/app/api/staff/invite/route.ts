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
  const { email, name, role, jobTitles } = body
  if (!email || !name) {
    return NextResponse.json({ error: 'email と name は必須です' }, { status: 400 })
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const setPasswordUrl = `${appUrl}/auth/callback?next=/set-password`
  let userId: string | undefined
  let actionLink: string | null = null
  let isExisting = false

  // 招待リンクを生成（メールは送信しない）
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { name, role: role ?? 'staff' },
      redirectTo: setPasswordUrl,
    },
  })

  if (linkError) {
    // すでに登録済みの場合はパスワードリセットリンクにフォールバック
    const alreadyExists =
      linkError.message.toLowerCase().includes('already been registered') ||
      linkError.message.toLowerCase().includes('already registered') ||
      linkError.message.toLowerCase().includes('already exists')

    if (!alreadyExists) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const { data: recoveryData, error: recoveryError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl}/login` },
    })
    if (recoveryError) {
      return NextResponse.json({ error: recoveryError.message }, { status: 500 })
    }
    userId = recoveryData?.user?.id
    actionLink = recoveryData?.properties?.action_link ?? null
    isExisting = true
  } else {
    userId = linkData?.user?.id
    actionLink = linkData?.properties?.action_link ?? null
  }

  // users テーブルに登録（既存ユーザーはロール・名前を更新）
  if (userId) {
    await supabase.from('users').upsert({
      id: userId,
      name,
      email,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })
  }

  return NextResponse.json({
    success: true,
    inviteLink: actionLink,
    isExisting,
  })
}
