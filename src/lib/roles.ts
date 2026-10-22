/**
 * 役職（ロール）の定義と権限判定。
 *
 * ログイン権限そのものは users.role（'admin' | 'staff' | 'parent'）で表す。
 * 「サービス管理者」は users.job_titles に持たせる追加役職で、
 * ログイン権限としては staff と同じ（設定・請求・シフトには入れない）。
 * 追加でできることは「児童管理 → 利用スケジュール」の編集のみ。
 *
 * 「施設長」は users.role = 'admin' に job_titles の facility_manager を重ねたもの。
 * システム管理者と同じことができるが、お金まわり（国保連請求・保護者請求・上限管理と、
 * タイムカード・勤務時間集計・有給・残業・スタッフ申請）だけは扱えない。
 * 施設長を任命・解除できるのはシステム管理者だけ。
 */

/** サービス管理者を表す job_titles の値 */
export const SERVICE_MANAGER = 'service_manager'

/** 施設長を表す job_titles の値（users.role は 'admin'） */
export const FACILITY_MANAGER = 'facility_manager'

/** 役職の表示名（users.role / users.job_titles / staff_members.roles 共通） */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'システム管理者',
  facility_manager: '施設長',
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
  facility_manager: 'bg-sky-100 text-sky-700',
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

/** 施設長か（システム管理者の権限からお金まわりを外した役職） */
export function isFacilityManager(role: string | null, jobTitles: string[] | null): boolean {
  return role === 'admin' && (jobTitles ?? []).includes(FACILITY_MANAGER)
}

/**
 * バッジに出すログイン権限のキー。施設長は users.role が 'admin' でも「施設長」と見せる。
 * 追加の役職は otherJobTitles で、施設長を除いて出す。
 */
export function accessKey(role: string, jobTitles: string[] | null): string {
  return isFacilityManager(role, jobTitles) ? FACILITY_MANAGER : role
}

export function otherJobTitles(jobTitles: string[] | null): string[] {
  return (jobTitles ?? []).filter((t) => t !== FACILITY_MANAGER)
}

/**
 * 管理者が、相手のアカウント（削除・パスワード再発行・役職の変更）を操作できるか。
 * 施設長はシステム管理者・ほかの施設長（どちらも users.role = 'admin'）には触れない。
 * これがないと、施設長が自分より上の権限を作ったり奪ったりできてしまう。
 */
export function canManageAccountOf(
  actorRole: string | null,
  actorJobTitles: string[] | null,
  targetRole: string | null,
): boolean {
  if (actorRole !== 'admin') return false
  if (isFacilityManager(actorRole, actorJobTitles)) return targetRole === 'staff' || targetRole === 'parent'
  return true
}

/**
 * お金まわり（請求・給与）を扱えるか。システム管理者だけ。
 * users テーブルの値で判定すること（user_metadata は本人が書き換えられる）。
 */
export function canManageMoney(role: string | null, jobTitles: string[] | null): boolean {
  return role === 'admin' && !(jobTitles ?? []).includes(FACILITY_MANAGER)
}
