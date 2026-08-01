import { createClient } from '@/lib/supabase/server'

// スタッフ申請の未確認件数バッジ。
// layout の表示をブロックしないよう Suspense 配下でストリーミング取得する。
export async function PendingRequestsBadge() {
  const supabase = await createClient()

  const [{ count: overtimeCount }, { count: leaveCount }, { count: breakCount }] = await Promise.all([
    supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_new', true),
    supabase.from('paid_leave_usages').select('id', { count: 'exact', head: true }).eq('is_new', true),
    supabase.from('time_records').select('id', { count: 'exact', head: true }).eq('type', 'break_start').eq('is_new', true),
  ])
  const pendingCount = (overtimeCount ?? 0) + (leaveCount ?? 0) + (breakCount ?? 0)

  if (pendingCount <= 0) return null

  return (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {pendingCount > 9 ? '9+' : pendingCount}
    </span>
  )
}
