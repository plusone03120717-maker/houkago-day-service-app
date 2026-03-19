import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ParentNav } from '@/components/parent/parent-nav'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  // スタッフ・管理者はスタッフ画面へ
  if (userData?.role === 'admin' || userData?.role === 'staff') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ParentNav userName={userData?.name} userId={user.id} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {children}
      </main>
    </div>
  )
}
