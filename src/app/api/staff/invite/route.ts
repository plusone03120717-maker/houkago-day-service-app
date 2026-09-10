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

type AuthUser = {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}

/**
 * 疑似メールアドレスから既存の Auth ユーザーを探す。
 *
 * listUsers は1ページ分しか返さないため、保護者アカウントが増えると
 * 既存スタッフを取りこぼす。1ページずつ最後まで見る。
 */
async function findAuthUserByEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  email: string
) {
  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data } = await adminClient.auth.admin.listUsers({ page, perPage })
    const users: AuthUser[] = data?.users ?? []
    const hit = users.find((u) => u.email === email)
    if (hit) return hit
    if (users.length < perPage) return null
  }
  return null
}

async function upsertStaffMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  userId: string,
  name: string,
  jobTitles: unknown
) {
  const titles = Array.isArray(jobTitles) ? (jobTitles as string[]) : []
  const { data: existing } = await adminClient
    .from('staff_members')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await adminClient
      .from('staff_members')
      .update({ name, role: titles[0] ?? 'staff', roles: titles })
      .eq('id', (existing as { id: string }).id)
  } else {
    await adminClient.from('staff_members').insert({
      user_id: userId,
      name,
      role: titles[0] ?? 'staff',
      roles: titles,
    })
  }
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
  const { phone, name, role, jobTitles, overwrite } = body
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

  // 疑似メールアドレス（＝電話番号）で既存ユーザーを検索
  const existingAuthUser = await findAuthUserByEmail(adminClient, pseudoEmail)

  if (existingAuthUser) {
    // RLS を通さない adminClient で引く。招待者から見えない行でも
    // 「別人のアカウントを上書きしていないか」は必ず判定する必要がある。
    const { data: existingDbUser } = await adminClient
      .from('users')
      .select('name, role')
      .eq('id', existingAuthUser.id)
      .maybeSingle()

    if (existingDbUser?.role === 'admin') {
      return NextResponse.json(
        { error: 'この電話番号は管理者アカウントです。スタッフとして登録できません。' },
        { status: 409 }
      )
    }

    if (existingDbUser?.role === 'parent') {
      return NextResponse.json(
        { error: 'この電話番号は保護者アカウントで使われています。別の電話番号を入力してください。' },
        { status: 409 }
      )
    }

    // 同じ電話番号の既存スタッフがいる場合、そのアカウントは名前ごと
    // 上書きされる（＝既存スタッフが一覧から消える）。別人の可能性が高いので、
    // 名前が違うときは明示的な確認なしには進めない。
    const existingName = String(
      existingDbUser?.name ?? existingAuthUser.user_metadata?.name ?? ''
    ).trim()
    if (existingName && existingName !== name.trim() && overwrite !== true) {
      return NextResponse.json(
        {
          error: `この電話番号は既に「${existingName}」さんで登録されています。別の電話番号を入力してください。`,
          conflictName: existingName,
        },
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
    const { error: upsertError } = await adminClient.from('users').upsert({
      id: existingAuthUser.id,
      name,
      email: pseudoEmail,
      phone: normalizedPhone,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
    await upsertStaffMember(adminClient, existingAuthUser.id, name, jobTitles)

    return NextResponse.json({
      success: true,
      isExisting: true,
      overwrittenName: existingName && existingName !== name.trim() ? existingName : null,
      phone: normalizedPhone,
      tempPassword,
    })
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
    const { error: upsertError } = await adminClient.from('users').upsert({
      id: createData.user.id,
      name,
      email: pseudoEmail,
      phone: normalizedPhone,
      role: role ?? 'staff',
      job_titles: Array.isArray(jobTitles) ? jobTitles : [],
    })
    if (upsertError) {
      // ここで失敗すると Auth だけ増えて一覧に出ない中途半端な状態になるため、
      // 作ったばかりの Auth ユーザーを消してから失敗を返す。
      await adminClient.auth.admin.deleteUser(createData.user.id)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
    await upsertStaffMember(adminClient, createData.user.id, name, jobTitles)
  }

  return NextResponse.json({ success: true, isExisting: false, phone: normalizedPhone, tempPassword })
}
