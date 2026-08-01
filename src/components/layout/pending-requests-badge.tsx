import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from '@/components/layout/notification-bell'

// ヘッダーのお知らせベル。未確認のスタッフ申請と保護者利用連絡を集計する。
// layout の表示をブロックしないよう Suspense 配下でストリーミング取得する。
export async function PendingRequestsBadge() {
  const supabase = await createClient()

  const [
    { count: overtimeCount },
    { count: leaveCount },
    { count: breakCount },
    { count: parentContactCount },
    { data: recentContactsRaw },
  ] = await Promise.all([
    supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('is_new', true),
    supabase.from('paid_leave_usages').select('id', { count: 'exact', head: true }).eq('is_new', true),
    supabase.from('time_records').select('id', { count: 'exact', head: true }).eq('type', 'break_start').eq('is_new', true),
    supabase.from('parent_attendance_contacts').select('id', { count: 'exact', head: true }).eq('is_new', true),
    supabase
      .from('parent_attendance_contacts')
      .select('id, date, status, service_type, children (name)')
      .eq('is_new', true)
      .order('reported_at', { ascending: false })
      .limit(5),
  ])

  const staffCount = (overtimeCount ?? 0) + (leaveCount ?? 0) + (breakCount ?? 0)
  const parentCount = parentContactCount ?? 0

  type RecentRow = {
    id: string
    date: string
    status: 'attending' | 'absent'
    service_type: 'regular' | 'daytime_support'
    children: { name: string } | null
  }
  const recentContacts = ((recentContactsRaw ?? []) as unknown as RecentRow[]).map((r) => ({
    id: r.id,
    date: r.date,
    childName: r.children?.name ?? '不明',
    label:
      r.status === 'absent' ? 'お休み'
      : r.service_type === 'daytime_support' ? '日中一時'
      : '放デイ',
  }))

  return (
    <NotificationBell
      staffCount={staffCount}
      parentCount={parentCount}
      recentContacts={recentContacts}
    />
  )
}
