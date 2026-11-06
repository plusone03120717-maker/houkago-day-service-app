import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from '@/components/layout/notification-bell'

// ヘッダーのお知らせベル。未確認のスタッフ申請・保護者利用連絡・保護者のLINE登録申請・
// サポート問い合わせを集計する。
// layout の表示をブロックしないよう Suspense 配下でストリーミング取得する。
// スタッフ申請（残業・有給・中抜け）は給与まわりなので、システム管理者にだけ数える。
export async function PendingRequestsBadge({ role, canManageMoney }: { role: string; canManageMoney: boolean }) {
  const supabase = await createClient()
  // 数えても表示しない分は問い合わせない（DB への往復を減らす）。
  // スタッフ申請はシステム管理者だけ、サポート問い合わせは管理者だけに出す。
  const zero = Promise.resolve({ count: 0 })
  const countNew = (table: 'overtime_requests' | 'paid_leave_usages' | 'support_inquiries') =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_new', true).then((r) => r)

  const [
    { count: overtimeCount },
    { count: leaveCount },
    { count: breakCount },
    { count: parentContactCount, data: recentContactsRaw },
    { count: registrationCountRaw },
    { count: supportCountRaw },
  ] = await Promise.all([
    canManageMoney ? countNew('overtime_requests') : zero,
    canManageMoney ? countNew('paid_leave_usages') : zero,
    canManageMoney
      ? supabase.from('time_records').select('id', { count: 'exact', head: true }).eq('type', 'break_start').eq('is_new', true).then((r) => r)
      : zero,
    // 未確認の件数と新しい5件を1回で取る（count は limit をかける前の全件数）
    supabase
      .from('parent_attendance_contacts')
      .select('id, date, status, children (name)', { count: 'exact' })
      .eq('is_new', true)
      .order('reported_at', { ascending: false })
      .limit(5),
    supabase
      .from('guardian_registration_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // サポート問い合わせは管理者だけの対応待ち行列なので、管理者にだけ出す
    role === 'admin' ? countNew('support_inquiries') : zero,
  ])

  const staffCount = canManageMoney ? (overtimeCount ?? 0) + (leaveCount ?? 0) + (breakCount ?? 0) : 0
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
      registrationCount={registrationCountRaw ?? 0}
      supportCount={supportCount}
      recentContacts={recentContacts}
    />
  )
}
