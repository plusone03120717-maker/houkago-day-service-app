import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser, getSessionUserRow } from '@/lib/auth'
import { canEditOperations, canManageMoney, isFacilityManager } from '@/lib/roles'

/**
 * 管理者（システム管理者・施設長）のみアクセス可能なページで呼ぶ。
 * 役職は users テーブルの値で判定する（JWT の user_metadata は本人が書き換えられるため使わない）。
 * スタッフはダッシュボード、保護者は保護者画面、users に行がない人はログイン画面へ戻す。
 */
export async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role === 'admin') return
  if (user.role === 'staff') redirect('/dashboard')
  if (user.role === 'parent') redirect('/parent')
  redirect('/login')
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
 * users の読み取りは getSessionUser と共通（1回の表示につき1回だけ）。
 */
export const getStaffAccess = cache(async (): Promise<StaffAccess | null> => {
  const res = await getSessionUserRow()
  if (!res) return null
  const role = res.row?.role ?? null
  const jobTitles = res.row?.job_titles ?? []

  return {
    userId: res.id,
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
