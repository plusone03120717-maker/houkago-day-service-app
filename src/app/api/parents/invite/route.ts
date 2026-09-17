import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  linkChildrenToPortalAccount,
  linkPortalAccountToGuardians,
} from '@/lib/parent-account-link'

function generateLoginCode(): string {
  // 読みやすい6文字の英数字コード（O/0, I/1/l は除外）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** 管理者のみ。権限があれば null、なければエラーレスポンスを返す */
async function requireAdmin(): Promise<NextResponse | null> {
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
  return null
}

/**
 * 既存の保護者アカウント一覧を返す（兄弟の追加登録用）。
 *
 * 兄弟がいる家庭でも児童ごとに別アカウントを作っていたため、保護者は子の人数だけ
 * ログインし直す必要があった。作成画面から既存アカウントを選べるようにして、
 * 1アカウントで兄弟をまとめられるようにする。
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const admin = adminClient()
  const { data: usersRaw } = await admin
    .from('users')
    .select('id, name, email, parent_children(children(id, name))')
    .eq('role', 'parent')
    .order('created_at', { ascending: true })

  const accounts = ((usersRaw ?? []) as unknown as {
    id: string
    name: string
    email: string
    parent_children: { children: { id: string; name: string } | null }[]
  }[]).map((u) => ({
    id: u.id,
    name: u.name,
    // メールアドレス代わりのログインコード（XXXXXX@parent.local の前半）
    loginCode: u.email.split('@')[0],
    children: u.parent_children
      .map((pc) => pc.children)
      .filter((c): c is { id: string; name: string } => c !== null),
  }))

  return NextResponse.json({ accounts })
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json()
  const { name, childId, password, linkToUserId } = body as {
    name?: string
    childId: string
    password?: string
    /** 指定すると新規作成せず、この既存アカウントに児童を追加する（兄弟の追加登録） */
    linkToUserId?: string
  }

  if (!childId) {
    return NextResponse.json({ error: 'childId は必須です' }, { status: 400 })
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上で入力してください' }, { status: 400 })
  }

  const admin = adminClient()

  // ── 既存アカウントへの追加（兄弟の追加登録） ──
  if (linkToUserId) {
    const { data: target } = await admin
      .from('users')
      .select('id, role')
      .eq('id', linkToUserId)
      .maybeSingle()
    if (!target || (target as { role: string }).role !== 'parent') {
      return NextResponse.json({ error: '指定された保護者アカウントが見つかりません' }, { status: 404 })
    }

    await linkChildrenToPortalAccount(admin, linkToUserId, [childId])
    if (password) {
      await admin.auth.admin.updateUserById(linkToUserId, { password })
    }
    await linkPortalAccountToGuardians(admin, linkToUserId, childId)
    return NextResponse.json({ success: true, mode: 'linked' })
  }

  if (!name || !password) {
    return NextResponse.json({ error: 'name, childId, password は必須です' }, { status: 400 })
  }

  // ── この児童にすでに保護者アカウントが紐付いているか確認（複数でも対応） ──
  const { data: existingLinks } = await admin
    .from('parent_children')
    .select('user_id')
    .eq('child_id', childId)

  if (existingLinks && existingLinks.length > 0) {
    // 既存アカウント全てのパスワードを更新
    for (const link of existingLinks as { user_id: string }[]) {
      await admin.auth.admin.updateUserById(link.user_id, { password })
      await linkPortalAccountToGuardians(admin, link.user_id, childId)
    }
    return NextResponse.json({ success: true, mode: 'password_updated' })
  }

  // ── LINEで登録済みの保護者にポータルアカウントがあれば、それを使い回す ──
  // 兄弟の片方だけLINE登録済み、という家庭でもアカウントが増えないようにする。
  const { data: guardianLinks } = await admin
    .from('guardian_children')
    .select('guardians(user_id)')
    .eq('child_id', childId)
  const linkedUserId = ((guardianLinks ?? []) as unknown as {
    guardians: { user_id: string | null } | null
  }[])
    .map((l) => l.guardians?.user_id)
    .find((id): id is string => !!id)

  if (linkedUserId) {
    await linkChildrenToPortalAccount(admin, linkedUserId, [childId])
    await admin.auth.admin.updateUserById(linkedUserId, { password })
    return NextResponse.json({ success: true, mode: 'linked_via_line' })
  }

  // ── 新規登録：ユニークなログインコードを生成してメールアドレス代わりに使用 ──
  let loginCode = generateLoginCode()
  let email = `${loginCode}@parent.local`

  // 万一衝突したら再生成
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (!existing) break
    loginCode = generateLoginCode()
    email = `${loginCode}@parent.local`
    attempts++
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'parent' },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userId = data.user.id
  await admin.from('users').upsert({ id: userId, name, email, role: 'parent' })
  await admin.from('parent_children').upsert({ user_id: userId, child_id: childId })

  // この児童がすでにLINE登録済みなら、同じ保護者として結び付ける
  await linkPortalAccountToGuardians(admin, userId, childId)

  return NextResponse.json({ success: true, mode: 'created' })
}
