export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSessionUserId } from '@/lib/auth'

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  // Auth サーバーへ聞きに行かず、JWT を手元で確かめるだけにする（proxy.ts と同じ）
  const userId = await getSessionUserId()
  if (!userId) redirect('/login')
  return <div className="bg-white min-h-screen">{children}</div>
}
