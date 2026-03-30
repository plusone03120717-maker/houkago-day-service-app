'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function deleteChild(childId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 管理者のみ削除可能
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (userData?.role !== 'admin') redirect('/children')

  const { error } = await supabase.from('children').delete().eq('id', childId)
  if (error) {
    // エラーは無視してリダイレクト（実運用では適切なエラーハンドリングを）
    console.error('delete child error:', error.message)
  }

  redirect('/children')
}
