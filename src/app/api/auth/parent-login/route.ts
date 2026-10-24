import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// 保護者のログイン（お子さんの名前＋パスワード）。
// 以前は「名前 → 保護者のメール」を返す API をブラウザから呼んでいたため、
// ログインしなくても在籍の有無とメール（ログインコード）が分かってしまった。
// いまは名前の照合からパスワードの確認までをサーバーで行い、メールは外に出さない。
// 失敗が続くと止める（同じ IP は10分に5回・同じ名前は10分に10回）。
// TURNSTILE_SECRET_KEY があれば Cloudflare Turnstile でロボットかどうかも確かめる。

const FAIL_MESSAGE = 'お子さんの名前かパスワードが正しくありません。分からないときは事業所にお問い合わせください'
const LOCK_MESSAGE = 'ログインの失敗が続いたため、しばらく受け付けを止めています。10分ほど待ってからもう一度お試しください'
const WINDOW_MINUTES = 10
const MAX_FAILS_PER_IP = 5
const MAX_FAILS_PER_NAME = 10

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// スペース（全角・半角）を除去して正規化
const normalize = (s: string) => s.replace(/[\s　]/g, '').toLowerCase()

// IP と名前はそのまま残さず、ハッシュにして記録する
const hash = (value: string) =>
  createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY}:${value}`).digest('hex')

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

async function countRecentFails(column: 'ip_hash' | 'name_hash', value: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count, error } = await adminClient
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since)
  if (error) {
    console.error('[parent-login] 失敗回数の確認に失敗', error.message)
    return 0
  }
  return count ?? 0
}

async function recordFail(ipHash: string, nameHash: string) {
  const { error } = await adminClient.from('login_attempts').insert({ ip_hash: ipHash, name_hash: nameHash })
  if (error) console.error('[parent-login] 失敗の記録に失敗', error.message)
  // 1日より前の記録は消す
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await adminClient.from('login_attempts').delete().lt('created_at', old)
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // 鍵の登録前は確かめない
  if (!token) return false
  const body = new URLSearchParams({ secret, response: token, remoteip: ip })
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const json = await res.json() as { success?: boolean }
    return json.success === true
  } catch (e) {
    console.error('[parent-login] Turnstile の確認に失敗', e)
    return false
  }
}

async function findParentEmail(childName: string): Promise<string | null> {
  const normalizedInput = normalize(childName)

  // まず全件取得してスペース無視で比較
  const { data: allChildren } = await adminClient
    .from('children')
    .select('id, name')

  const childIds = (allChildren ?? [])
    .filter((c: { id: string; name: string }) => normalize(c.name) === normalizedInput)
    .map((c: { id: string }) => c.id)
  if (childIds.length === 0) return null

  const { data: links } = await adminClient
    .from('parent_children')
    .select('user_id')
    .in('child_id', childIds)
  if (!links || links.length === 0) return null

  const { data: users } = await adminClient
    .from('users')
    .select('email')
    .in('id', links.map((l: { user_id: string }) => l.user_id))
    .eq('role', 'parent')
    .order('created_at', { ascending: true })

  // 保護者が複数いる場合は最初の1件を使用
  return users?.[0]?.email ?? null
}

export async function POST(request: NextRequest) {
  const { childName, password, turnstileToken } = await request.json() as {
    childName?: string
    password?: string
    turnstileToken?: string
  }
  if (!childName?.trim() || !password) {
    return NextResponse.json({ error: 'お子さんの名前とパスワードを入力してください' }, { status: 400 })
  }

  const ip = clientIp(request)
  const ipHash = hash(`ip:${ip}`)
  const nameHash = hash(`name:${normalize(childName)}`)

  const [ipFails, nameFails] = await Promise.all([
    countRecentFails('ip_hash', ipHash),
    countRecentFails('name_hash', nameHash),
  ])
  if (ipFails >= MAX_FAILS_PER_IP || nameFails >= MAX_FAILS_PER_NAME) {
    return NextResponse.json({ error: LOCK_MESSAGE }, { status: 429 })
  }

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json(
      { error: 'ロボットでないことの確認ができませんでした。ページを読み込み直してから、もう一度お試しください' },
      { status: 400 }
    )
  }

  const email = await findParentEmail(childName.trim())
  if (!email) {
    await recordFail(ipHash, nameHash)
    return NextResponse.json({ error: FAIL_MESSAGE }, { status: 401 })
  }

  // ここでログインすると、セッションのクッキーがこのレスポンスに付く
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    await recordFail(ipHash, nameHash)
    return NextResponse.json({ error: FAIL_MESSAGE }, { status: 401 })
  }

  return NextResponse.json({
    needsPasswordChange: data.user.user_metadata?.needs_password_change === true,
  })
}
