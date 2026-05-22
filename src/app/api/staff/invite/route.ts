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
  return (
    upper[arr[0] % upper.length] +
    lower[arr[1] % lower.length] +
    digits[arr[2] % digits.length] +
    Array.from(arr.slice(3), (b) => all[b % all.length]).join('')
  )
}

/** 電話番号を正規化（数字のみ抽出、先頭+81は0に変換） */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/[\s\-\(\)\.]/g, '')
  if (digits.startsWith('+81')) digits = '0' + digits.slice(3)
  return digits
}

/** 電話番号から疑似メールアドレスを生成 */
function phoneToPseudoEmail(phone: string): string {
  return `${normalizePhone(phone)}@staff.internal`
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
    return NextResponse.json({ error: '管理者のみ招待できます' }, { status: 403 })
  }

  const body = await request.json()
  const { phone, name, role, jobTitles } = body
  if (!phone || !name) {
    return NextResponse.json({ error: 'phone と name は必須です' }, { status: 400 })
  }

  const normalizedPhone = normalizePhone(phone)
  if (!/^0[0-9]{9,10}$/.test(normalizedPhone)) {
    return NextResponse.json({ error: '正しい電話番号を入力してください（例：090-1234-5678）' }, { status: 400 })
  }

  const pseudoEmail = phoneToPseudoEmail(phone)

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 疑似メールアドレスで既存ユーザーを検索
  const { data: authList } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const existingAuthUser = authList?.users?.find((u) => u.email === pseudoEmail)

  if (existingAuthUser) {
    const { data: existingDbUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', existingAuthUser.id)
      .single()

    if (existingDbUser?.role === 'admin') {
      return NextResponse.json(
        { error: 'この電話番号は管理者アカウントです。スタッフとして登録できません。' },
        { status: 409 }
      )
    }

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
      email: pseudoEmail,
      phone: normalizedPhone,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })

    return NextResponse.json({ success: true, isExisting: true, phone: normalizedPhone, tempPassword })
  }

  // 新規スタッフ作成
  const tempPassword = generateTempPassword()
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email: pseudoEmail,
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
      email: pseudoEmail,
      phone: normalizedPhone,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })
  }

  return NextResponse.json({ success: true, isExisting: false, phone: normalizedPhone, tempPassword })
}
