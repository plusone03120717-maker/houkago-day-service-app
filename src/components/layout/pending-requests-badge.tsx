import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from '@/components/layout/notification-bell'

// ヘッダーのお知らせベル。未確認のスタッフ申請・保護者利用連絡・サポート問い合わせを集計する。
// layout の表示をブロックしないよう Suspense 配下でストリーミング取得する。
export async function PendingRequestsBadge({ role }: { role: string }) {
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
      .select('id, date, status, children (name)')
      .eq('is_new', true)
      .order('reported_at', { ascending: false })
      .limit(5),
  ])

  // サポート問い合わせは管理者だけの対応待ち行列なので、管理者にだけ出す
  const { count: supportCountRaw } =
    role === 'admin'
      ? await supabase
          .from('support_inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('is_new', true)
      : { count: 0 }

  const staffCount = (overtimeCount ?? 0) + (leaveCount ?? 0) + (breakCount ?? 0)
  const parentCount = parentContactCount ?? 0
  const supportCount = supportCountRaw ?? 0

  type RecentRow = {
    id: string
    date: string
    status: 'attending' | 'absent'
    children: { name: string } | null
  }
  // 放デイか日中一時かは施設が承認するときに決めるので、
  // 未確認の連絡の時点ではまだ区分が無い（@/lib/parent-contact-service）
  const recentContacts = ((recentContactsRaw ?? []) as unknown as RecentRow[]).map((r) => ({
    id: r.id,
    date: r.date,
    childName: r.children?.name ?? '不明',
    label: r.status === 'absent' ? 'お休み' : '利用',
  }))

  return (
    <NotificationBell
      staffCount={staffCount}
      parentCount={parentCount}
      supportCount={supportCount}
      recentContacts={recentContacts}
    />
  )
}
