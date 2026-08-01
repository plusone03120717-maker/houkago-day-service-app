import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PendingRequestsBadge } from '@/components/layout/pending-requests-badge'

// 認証ユーザーごとにデータが異なるため、サーバーキャッシュ・ルーターキャッシュを完全に無効化
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // ユーザー情報取得
  const { data: userData } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  // 保護者の場合は保護者ダッシュボードへリダイレクト
  if (userData?.role === 'parent') {
    redirect('/parent')
  }

  const role = userData?.role ?? 'staff'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role={role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* お知らせベルはページ表示をブロックせず後から流し込む */}
        <Header
          userName={userData?.name}
          pendingBadge={
            <Suspense fallback={null}>
              <PendingRequestsBadge />
            </Suspense>
          }
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
