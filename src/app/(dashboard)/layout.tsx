import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requireSessionUser, isStaffRole } from '@/lib/auth'
import { getStaffAccess } from '@/lib/require-admin'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PendingRequestsBadge } from '@/components/layout/pending-requests-badge'
import { ScheduleChangePrompt } from '@/components/layout/schedule-change-prompt'

// 認証ユーザーごとにデータが異なるため、サーバーキャッシュ・ルーターキャッシュを完全に無効化
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // JWT はローカル検証、役職は users テーブルを1回だけ読む。詳細は lib/auth.ts を参照。
  const user = await requireSessionUser()

  // 役職は users テーブルの値。保護者は保護者画面へ、users に行がない人はログイン画面へ
  if (user.role === 'parent') {
    redirect('/parent')
  }
  if (!isStaffRole(user.role)) {
    redirect('/login')
  }

  const role = user.role as string
  // 施設長かどうか（お金まわりを外した管理者）。users の読み取りは getSessionUser と共通
  const access = role === 'staff' ? null : await getStaffAccess()
  const canManageMoney = access?.canManageMoney ?? false
  // 保護者へ「変更を知らせる」を押せる人（システム管理者）にだけ、押し忘れの確認を出す
  const canEditOperations = access?.canEditOperations ?? false

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role={role} canManageMoney={canManageMoney} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* お知らせベルはページ表示をブロックせず後から流し込む */}
        <Header
          userName={user.name ?? undefined}
          pendingBadge={
            <Suspense fallback={null}>
              <PendingRequestsBadge role={role} canManageMoney={canManageMoney} />
            </Suspense>
          }
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      {canEditOperations && <ScheduleChangePrompt />}
    </div>
  )
}
