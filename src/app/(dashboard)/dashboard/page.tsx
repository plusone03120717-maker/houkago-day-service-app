import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, AlertTriangle, ClipboardList, MessageSquare,
  Calendar, BookOpen, ArrowRight,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

type ExpiringCert = {
  id: string
  end_date: string
  child_id: string
  children: { name: string } | null
}

type NotableRecord = {
  id: string
  content: string
  created_at: string
  daily_attendance: { date: string; children: { name: string } | null } | null
}

type Reservation = {
  id: string
  child_id: string
  status: string
  date: string
  children: { name: string } | null
  units: { name: string } | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const today = formatDate(new Date(), 'yyyy-MM-dd')

  // 並列フェッチ
  const [
    todayReservationsResult,
    expiringCertsResult,
    notableRecordsResult,
    unreadMessagesResult,
    pendingReservationsResult,
    unwrittenRecordsResult,
  ] = await Promise.all([
    supabase
      .from('usage_reservations')
      .select('id, child_id, status, date, children(name), units(name)')
      .eq('date', today)
      .in('status', ['confirmed', 'reserved']),

    supabase
      .from('benefit_certificates')
      .select('id, end_date, child_id, children(name)')
      .lte('end_date', formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
      .gte('end_date', today)
      .order('end_date', { ascending: true }),

    supabase
      .from('daily_records')
      .select('id, content, created_at, daily_attendance(date, children(name))')
      .eq('has_notable_flag', true)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5),

    // 自分宛の未読メッセージ数
    user ? supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .is('read_at', null) : Promise.resolve({ count: 0 }),

    // 承認待ち予約数
    supabase
      .from('usage_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reserved'),

    // 当日の出席済み・記録未作成カウント
    supabase
      .from('daily_attendance')
      .select('id')
      .eq('date', today)
      .eq('status', 'attended'),
  ])

  const todayReservations = (todayReservationsResult.data ?? []) as unknown as Reservation[]
  const expiringCerts = (expiringCertsResult.data ?? []) as unknown as ExpiringCert[]
  const notableRecords = (notableRecordsResult.data ?? []) as unknown as NotableRecord[]
  const unreadCount = unreadMessagesResult.count ?? 0
  const pendingCount = pendingReservationsResult.count ?? 0
  const todayAttendedIds = (unwrittenRecordsResult.data ?? []).map((a: { id: string }) => a.id)

  // 記録済みの出席ID
  let writtenCount = 0
  if (todayAttendedIds.length > 0) {
    const { count } = await supabase
      .from('daily_records')
      .select('id', { count: 'exact', head: true })
      .in('attendance_id', todayAttendedIds)
    writtenCount = count ?? 0
  }
  const unwrittenCount = todayAttendedIds.length - writtenCount

  const summaryCards = [
    {
      label: '本日の利用予定',
      value: todayReservations.length,
      unit: '名',
      icon: Users,
      color: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      href: '/attendance',
    },
    {
      label: '承認待ち予約',
      value: pendingCount,
      unit: '件',
      icon: Calendar,
      color: pendingCount > 0 ? 'bg-yellow-100' : 'bg-gray-100',
      iconColor: pendingCount > 0 ? 'text-yellow-600' : 'text-gray-400',
      href: '/usage',
    },
    {
      label: '未読メッセージ',
      value: unreadCount,
      unit: '件',
      icon: MessageSquare,
      color: unreadCount > 0 ? 'bg-rose-100' : 'bg-gray-100',
      iconColor: unreadCount > 0 ? 'text-rose-600' : 'text-gray-400',
      href: '/messages',
    },
    {
      label: '受給者証 期限切れ間近',
      value: expiringCerts.length,
      unit: '件',
      icon: AlertTriangle,
      color: expiringCerts.length > 0 ? 'bg-red-100' : 'bg-gray-100',
      iconColor: expiringCerts.length > 0 ? 'text-red-500' : 'text-gray-400',
      href: '/children',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate(new Date(), 'yyyy年MM月dd日')}</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}>
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`p-2 ${card.color} rounded-lg flex-shrink-0`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {card.value}
                      <span className="text-sm font-normal text-gray-500 ml-1">{card.unit}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* 記録未作成アラート */}
      {unwrittenCount > 0 && (
        <Link href={`/records?date=${today}`}>
          <Card className="border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-800">本日の記録が未作成です</p>
                  <p className="text-sm text-orange-600">出席{todayAttendedIds.length}名中、{unwrittenCount}名の記録が未作成</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-orange-500" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 本日の利用予定 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-indigo-600" />
                本日の利用予定
              </CardTitle>
              <Link href="/attendance" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                出席管理 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {todayReservations.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">本日の利用予定はありません</p>
            ) : (
              <div className="space-y-1">
                {todayReservations.map((res) => (
                  <div key={res.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-900">{res.children?.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{res.units?.name}</span>
                      <Badge variant={res.status === 'confirmed' ? 'success' : 'secondary'} className="text-xs">
                        {res.status === 'confirmed' ? '確定' : '予約済'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 受給者証期限切れ間近 */}
        {expiringCerts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  受給者証の期限切れ間近
                </CardTitle>
                <Link href="/children" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                  児童管理 <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringCerts.map((cert) => {
                  const daysLeft = Math.ceil(
                    (new Date(cert.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  )
                  return (
                    <div key={cert.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm font-medium text-gray-900">{cert.children?.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDate(cert.end_date)}</span>
                        <Badge variant={daysLeft <= 7 ? 'destructive' : 'warning'}>残り{daysLeft}日</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 特記事項 */}
        {notableRecords.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-yellow-600">
                <ClipboardList className="h-4 w-4" />
                最近の特記事項
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notableRecords.map((record) => (
                  <div key={record.id} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {record.daily_attendance?.children?.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {record.daily_attendance?.date ? formatDate(record.daily_attendance.date) : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{record.content}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
