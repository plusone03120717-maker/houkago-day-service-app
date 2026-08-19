import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/auth'
import { ParentNav } from '@/components/parent/parent-nav'

// 認証ユーザーごとにデータが異なるため、サーバーキャッシュ・ルーターキャッシュを完全に無効化
export const dynamic = 'force-dynamic'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  // JWT のローカル検証のみ（getUser() + users 参照の2往復を削減）。詳細は lib/auth.ts
  const user = await requireSessionUser()

  // スタッフ・管理者はスタッフ画面へ
  if (user.role === 'admin' || user.role === 'staff') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ParentNav userName={user.name ?? undefined} userId={user.id} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {children}
      </main>
    </div>
  )
}
