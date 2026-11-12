import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canEditOperations, canManageMoney, isFacilityManager } from '@/lib/roles'

/**
 * 管理者（admin）のみアクセス可能なページで呼ぶ。
 * staff ロールの場合は /shifts へリダイレクト。
 * DBクエリを使わず JWT の user_metadata.role を参照。
 */
export async function requireAdmin() {
  const claims = await getSessionClaims()
  if (!claims) redirect('/login')

  // role が未設定（初期管理者等）の場合は通す。staff は必ずブロック。
  if (claims.role === 'staff') {
    redirect('/shifts')
  }
}

export type StaffAccess = {
  userId: string
  role: string | null
  jobTitles: string[]
  /** お金まわり（請求・給与）を扱える＝システム管理者 */
  canManageMoney: boolean
  isFacilityManager: boolean
  /** 業務の画面を編集できる＝システム管理者（施設長・スタッフは閲覧のみ） */
  canEditOperations: boolean
}

/**
 * ログイン中の職員の役職を users テーブルから読む。
 * 施設長かどうかは JWT に載らず、user_metadata は本人が書き換えられるため、
 * お金まわりの判定には必ずこちらを使う。未ログインなら null。
 * レイアウトとページの両方から呼ばれるので、1回の表示につき DB を読むのは1回だけにする（React の cache）。
 */
export const getStaffAccess = cache(async (): Promise<StaffAccess | null> => {
  const claims = await getSessionClaims()
  if (!claims) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('role, job_titles')
    .eq('id', claims.id)
    .maybeSingle()
  const row = data as { role: string | null; job_titles: string[] | null } | null
  const role = row?.role ?? null
  const jobTitles = row?.job_titles ?? []

  return {
    userId: claims.id,
    role,
    jobTitles,
    canManageMoney: canManageMoney(role, jobTitles),
    isFacilityManager: isFacilityManager(role, jobTitles),
    canEditOperations: canEditOperations(role, jobTitles),
  }
})

/**
 * お金まわりのページ（国保連請求・上限管理・保護者請求・請求の設定、
 * タイムカード・勤務時間集計・有給・出勤実績・スタッフ申請）で呼ぶ。
 * システム管理者以外（施設長・スタッフ）はダッシュボードへ戻す。
 */
export async function requireMoneyAccess() {
  const access = await getStaffAccess()
  if (!access) redirect('/login')
  if (!access.canManageMoney) redirect('/dashboard')
}

/**
 * API・サーバーアクション用。業務の画面を編集できる（＝システム管理者）なら true。
 * 施設長・スタッフは閲覧のみなので false。未ログインも false。
 */
export async function hasEditAccess(): Promise<boolean> {
  const access = await getStaffAccess()
  return access?.canEditOperations ?? false
}

/** API・サーバーアクション用。システム管理者なら true。 */
export async function hasMoneyAccess(): Promise<boolean> {
  const access = await getStaffAccess()
  return access?.canManageMoney ?? false
}
