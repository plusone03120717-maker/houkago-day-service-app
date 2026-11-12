import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type SessionUser = {
  id: string
  name: string | null
  /**
   * users テーブルの役職（'admin' | 'staff' | 'parent'）。
   * users に行がないアカウント（招待されずに自分で登録した人など）は null。
   * null は「どの画面にも入れない」として扱うこと。
   */
  role: string | null
}

export type SessionClaims = {
  id: string
  name: string | null
}

/**
 * JWT のクレームだけを読む（DB往復ゼロ・ネットワーク往復ゼロ）。
 *
 * getClaims() は JWT をローカル検証するため（非対称鍵なら）往復ゼロで済む。
 * 役職（role）はここでは返さない。JWT の user_metadata は本人が
 * supabase.auth.updateUser() で書き換えられるので、権限の判定には使えない。
 * 役職が要るときは getSessionUser()（users テーブルを読む）を使う。
 */
export const getSessionClaims = cache(async (): Promise<SessionClaims | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const id = claims?.sub
  if (!id) return null

  const meta = claims.user_metadata as { name?: string } | undefined
  return { id, name: meta?.name ?? null }
})

type UserRow = { name: string | null; role: string | null; job_titles: string[] | null }

/**
 * ログイン中の人の users テーブルの行（名前・役職・追加の役職）。
 * レイアウトとページの両方から呼ばれるので、1回の表示につき DB を読むのは1回だけ（React の cache）。
 */
export const getSessionUserRow = cache(async (): Promise<{ id: string; row: UserRow | null } | null> => {
  const claims = await getSessionClaims()
  if (!claims) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('name, role, job_titles')
    .eq('id', claims.id)
    .maybeSingle()
  return { id: claims.id, row: (data as UserRow | null) ?? null }
})

/**
 * ログイン中ユーザーを取得する。役職は必ず users テーブルの値（本人には書き換えられない）。
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const claims = await getSessionClaims()
  if (!claims) return null
  const res = await getSessionUserRow()

  return {
    id: claims.id,
    name: res?.row?.name ?? claims.name,
    role: res?.row?.role ?? null,
  }
})

/** スタッフ画面を使える役職か（システム管理者・施設長・スタッフ）。 */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff'
}

/**
 * API 用：職員（システム管理者・施設長・スタッフ）でなければ断る。
 * 通してよいときは null、断るときはそのまま返す応答。
 *   const denied = await staffApiGuard()
 *   if (denied) return denied
 */
export async function staffApiGuard(): Promise<NextResponse | null> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaffRole(user.role)) return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  return null
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
