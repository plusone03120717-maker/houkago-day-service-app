import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyLineAccessToken } from '@/lib/line/verify-id-token'
import { linkGuardianToPortalAccount } from '@/lib/parent-account-link'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * LINEでログイン中の保護者に、保護者ポータルのログイン用トークンを発行する。
 *
 * 保護者ポータルは「お子さんの名前＋パスワード」でログインする作りだが、
 * 日々の連絡はLINEで済ませている保護者にとってはパスワードが最大の脱落点だった。
 * LINEのアクセストークンで本人確認できている以上、そこからポータルのセッションを
 * 発行してしまえば、保護者はパスワードを覚えなくても連絡帳・お知らせ・請求書を見られる。
 *
 * メールは送らない。generateLink が返す hashed_token をそのまま画面へ渡し、
 * ブラウザ側の verifyOtp でセッションに換える。
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json() as { accessToken?: string }
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken が必要です' }, { status: 400 })
    }

    const lineUserId = await verifyLineAccessToken(accessToken)

    const { data: guardianRaw } = await adminClient
      .from('guardians')
      .select('id, user_id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()
    const guardian = guardianRaw as { id: string; user_id: string | null } | null

    if (!guardian) {
      return NextResponse.json({ available: false, reason: 'notRegistered' })
    }

    // まだ結び付いていなければ、この場で探して結び付ける
    const userId = guardian.user_id ?? (await linkGuardianToPortalAccount(adminClient, guardian.id))
    if (!userId) {
      return NextResponse.json({ available: false, reason: 'noPortalAccount' })
    }

    const { data: userRow } = await adminClient
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    const email = (userRow as { email: string } | null)?.email
    if (!email) {
      return NextResponse.json({ available: false, reason: 'noPortalAccount' })
    }

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (error || !data?.properties?.hashed_token) {
      console.error('[liff/portal-session] generateLink', error)
      return NextResponse.json({ error: 'ログイン情報の発行に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ available: true, tokenHash: data.properties.hashed_token })
  } catch (err) {
    console.error('[liff/portal-session]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
