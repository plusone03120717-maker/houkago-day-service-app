/**
 * 役職（ロール）の定義と権限判定。
 *
 * ログイン権限そのものは users.role（'admin' | 'staff' | 'parent'）で表す。
 * 「サービス管理者」は users.job_titles に持たせる追加役職で、
 * ログイン権限としては staff と同じ（設定・請求・シフトには入れない）。
 * 追加でできることは「児童管理 → 利用スケジュール」の編集のみ。
 */

/** サービス管理者を表す job_titles の値 */
export const SERVICE_MANAGER = 'service_manager'

/** 役職の表示名（users.role / users.job_titles / staff_members.roles 共通） */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'システム管理者',
  service_manager: 'サービス管理者',
  staff: 'スタッフ',
  driver: 'ドライバー',
  therapist: '療育士',
  nurse: '看護師',
  parent: '保護者',
}

/** 役職バッジの配色 */
export const ROLE_BADGE_CLASS: Record<string, string> = {
  admin: 'bg-indigo-100 text-indigo-700',
  service_manager: 'bg-violet-100 text-violet-700',
  staff: 'bg-gray-100 text-gray-700',
  driver: 'bg-amber-100 text-amber-700',
  therapist: 'bg-teal-100 text-teal-700',
  nurse: 'bg-rose-100 text-rose-700',
}

export function roleLabel(value: string): string {
  return ROLE_LABELS[value] ?? value
}

export function roleBadgeClass(value: string): string {
  return ROLE_BADGE_CLASS[value] ?? 'bg-gray-100 text-gray-700'
}

/**
 * 児童管理の「利用スケジュール」を編集できるか。
 * システム管理者と、サービス管理者の役職を持つスタッフのみ編集可。
 * （role 未設定の旧アカウント＝初期管理者は requireAdmin と同じく通す）
 */
export function canEditUsagePlans(role: string | null, jobTitles: string[] | null): boolean {
  if (role === 'parent') return false
  if (role === 'staff') return (jobTitles ?? []).includes(SERVICE_MANAGER)
  return true
}
