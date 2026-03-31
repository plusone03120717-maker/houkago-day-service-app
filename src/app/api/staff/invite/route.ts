import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = upper + lower + digits
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  // 最初の3文字は大文字・小文字・数字を必ず含める
  return (
    upper[arr[0] % upper.length] +
    lower[arr[1] % lower.length] +
    digits[arr[2] % digits.length] +
    Array.from(arr.slice(3), (b) => all[b % all.length]).join('')
  )
}

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

  // Supabase Auth 側で既存ユーザーをメールアドレスで検索
  const { data: authList } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const existingAuthUser = authList?.users?.find((u) => u.email === email)

  if (existingAuthUser) {
    // 既存ユーザーのロールを確認（adminは上書き禁止）
    const { data: existingDbUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', existingAuthUser.id)
      .single()

    if (existingDbUser?.role === 'admin') {
      return NextResponse.json(
        { error: 'このメールアドレスは管理者アカウントです。スタッフとして登録できません。' },
        { status: 409 }
      )
    }

    // 既存スタッフ: 仮パスワードをリセットしてロール・名前を更新
    const tempPassword = generateTempPassword()

    await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
      password: tempPassword,
      user_metadata: {
        ...existingAuthUser.user_metadata,
        name,
        role: role ?? 'staff',
        needs_password_change: true,
      },
    })

    await adminClient.from('users').upsert({
      id: existingAuthUser.id,
      name,
      email,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })

    return NextResponse.json({ success: true, isExisting: true, tempPassword })
  }

  // 新規スタッフ: 仮パスワードで作成
  const tempPassword = generateTempPassword()

  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, role: role ?? 'staff', needs_password_change: true },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  if (createData?.user) {
    await adminClient.from('users').upsert({
      id: createData.user.id,
      name,
      email,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })
  }

  return NextResponse.json({
    success: true,
    isExisting: false,
    tempPassword,
  })
}
