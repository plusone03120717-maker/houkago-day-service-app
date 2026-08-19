import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SessionUser = {
  id: string
  name: string | null
  role: string | null
}

/**
 * JWT のクレームだけを読む（DB往復ゼロ・ネットワーク往復ゼロ）。
 *
 * getUser() は呼ぶたびに Supabase Auth サーバーへネットワーク往復が発生する。
 * getClaims() は JWT をローカル検証するため（非対称鍵なら）往復ゼロで済む。
 * proxy.ts と同じ方式。
 *
 * name / role はスタッフ・保護者招待時に user_metadata へ書き込まれる
 * （api/staff/invite, api/parents/invite）。旧アカウントでは未設定のことがあり、
 * その場合 null が返る。
 */
export async function getSessionClaims(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const id = claims?.sub
  if (!id) return null

  const meta = claims.user_metadata as { name?: string; role?: string } | undefined
  return {
    id,
    name: meta?.name ?? null,
    role: meta?.role ?? null,
  }
}

/**
 * ログイン中ユーザーを取得する。
 * JWT に name / role が載っていない旧アカウント（初期管理者など）のときだけ
 * users テーブルへフォールバックするので、表示内容は従来と変わらない。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await getSessionClaims()
  if (!user) return null
  if (user.name !== null && user.role !== null) return user

  // JWT に載っていない項目だけ DB から補う
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    name: user.name ?? row?.name ?? null,
    role: user.role ?? row?.role ?? null,
  }
}

/**
 * ユーザーIDだけが必要な場面用（往復ゼロ）。未ログインなら null。
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims?.sub ?? null
}

/**
 * ログイン必須ページ用。未ログインなら /login へ。
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}
