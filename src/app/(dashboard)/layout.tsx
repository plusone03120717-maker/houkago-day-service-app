import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/auth'
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
  // getUser()（Auth サーバーへの往復）+ users テーブル参照の2往復を、
  // JWT のローカル検証だけで済ませる。詳細は lib/auth.ts を参照。
  const user = await requireSessionUser()

  // 保護者の場合は保護者ダッシュボードへリダイレクト
  if (user.role === 'parent') {
    redirect('/parent')
  }

  const role = user.role ?? 'staff'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role={role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* お知らせベルはページ表示をブロックせず後から流し込む */}
        <Header
          userName={user.name ?? undefined}
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
