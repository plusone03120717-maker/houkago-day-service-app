import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * 管理者（admin）のみアクセス可能なページで呼ぶ。
 * staff ロールの場合は /shifts へリダイレクト。
 * DBクエリを使わず JWT の user_metadata.role を参照。
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // user_metadata.role は仮パスワード登録時に設定済み
  const role = user.user_metadata?.role as string | undefined

  // role が未設定（初期管理者等）の場合は通す。staff は必ずブロック。
  if (role === 'staff') {
    redirect('/shifts')
  }
}
