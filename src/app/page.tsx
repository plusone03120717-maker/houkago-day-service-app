import { redirect } from 'next/navigation'
import { getSessionUserId } from '@/lib/auth'

export default async function RootPage() {
  // Auth サーバーへ聞きに行かず、JWT を手元で確かめるだけにする（proxy.ts と同じ）
  const userId = await getSessionUserId()

  if (!userId) {
    redirect('/login')
  }

  redirect('/dashboard')
}
