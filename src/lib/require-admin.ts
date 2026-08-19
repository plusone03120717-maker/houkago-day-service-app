import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/lib/auth'

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
