import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * 管理者（admin）のみアクセス可能なページで呼ぶ。
 * staff ロールの場合は /shifts へリダイレクト。
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!data || data.role === 'staff') {
    redirect('/shifts')
  }
}
