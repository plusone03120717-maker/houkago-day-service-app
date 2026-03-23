export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, AlertTriangle, ClipboardList, MessageSquare,
  Calendar, BookOpen, ArrowRight, TrendingUp, Pill, TriangleAlert, FileText,
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

type UnpublishedNote = {
  id: string
  date: string
  content: string
  children: { id: string; name: string } | null
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
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // 並列フェッチ
  const [
    todayReservationsResult,
    expiringCertsResult,
    notableRecordsResult,
    unreadMessagesResult,
    pendingReservationsResult,
    unwrittenRecordsResult,
    thisMonthAttendanceResult,
    lastMonthAttendanceResult,
    thisMonthChildrenResult,
    openIncidentsResult,
    todayMedLogsResult,
    activeMedsCountResult,
    unpublishedNotesResult,
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

    // 今月の延べ出席数
    supabase
      .from('daily_attendance')
      .select('id', { count: 'exact', head: true })
      .gte('date', thisMonthStart)
      .lte('date', today)
      .eq('status', 'attended'),

    // 先月の延べ出席数
    supabase
      .from('daily_attendance')
      .select('id', { count: 'exact', head: true })
      .gte('date', lastMonthStart)
      .lt('date', lastMonthEnd)
      .eq('status', 'attended'),

    // 今月の実利用児童数（ユニーク）
    supabase
      .from('daily_attendance')
      .select('child_id')
      .gte('date', thisMonthStart)
      .lte('date', today)
      .eq('status', 'attended'),

    // 未対応インシデント数
    supabase
      .from('incident_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),

    // 本日の与薬ログ数
    supabase
      .from('medication_logs')
      .select('id', { count: 'exact', head: true })
      .eq('log_date', today)
      .eq('status', 'given'),

    // 本日出席予定の有効薬数（给药对象数）
    supabase
      .from('child_medications')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),

    // 未公開の連絡帳
    supabase
      .from('contact_notes')
      .select('id, date, content, children(id, name)')
      .is('published_at', null)
      .order('date', { ascending: false })
      .limit(20),
  ])

  const todayReservations = (todayReservationsResult.data ?? []) as unknown as Reservation[]
  const expiringCerts = (expiringCertsResult.data ?? []) as unknown as ExpiringCert[]
  const notableRecords = (notableRecordsResult.data ?? []) as unknown as NotableRecord[]
  const unreadCount = unreadMessagesResult.count ?? 0
  const pendingCount = pendingReservationsResult.count ?? 0
  const todayAttendedIds = (unwrittenRecordsResult.data ?? []).map((a: { id: string }) => a.id)

  // 月次統計
  const thisMonthTotal = thisMonthAttendanceResult.count ?? 0
  const lastMonthTotal = lastMonthAttendanceResult.count ?? 0
  const diffFromLastMonth = thisMonthTotal - lastMonthTotal
  const uniqueChildIds = new Set(
    (thisMonthChildrenResult.data ?? []).map((r: { child_id: string }) => r.child_id)
  )
  const thisMonthUniqueChildren = uniqueChildIds.size

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

  const unpublishedNotes = (unpublishedNotesResult.data ?? []) as unknown as UnpublishedNote[]

  const openIncidentCount = openIncidentsResult.count ?? 0
  const todayGivenCount = todayMedLogsResult.count ?? 0
  const activeMedsTotal = activeMedsCountResult.count ?? 0
  const medPendingCount = Math.max(0, activeMedsTotal - todayGivenCount)

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

      {/* 今月の利用統計 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            今月の利用状況（{now.getMonth() + 1}月）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600">{thisMonthTotal}</p>
              <p className="text-xs text-gray-500 mt-0.5">延べ出席数</p>
              {lastMonthTotal > 0 && (
                <p className={`text-xs mt-0.5 font-medium ${diffFromLastMonth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {diffFromLastMonth >= 0 ? '+' : ''}{diffFromLastMonth} vs 先月
                </p>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold text-teal-600">{thisMonthUniqueChildren}</p>
              <p className="text-xs text-gray-500 mt-0.5">実利用児童数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">
                {thisMonthUniqueChildren > 0
                  ? (thisMonthTotal / thisMonthUniqueChildren).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">平均利用日数</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* アラートバナー群 */}
      <div className="space-y-2">
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

        {/* 服薬未実施アラート */}
        {medPendingCount > 0 && (
          <Link href="/children">
            <Card className="border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Pill className="h-5 w-5 text-violet-600" />
                  <div>
                    <p className="font-medium text-violet-800">与薬が未実施の薬があります</p>
                    <p className="text-sm text-violet-600">本日の与薬依頼 {activeMedsTotal}件中、{medPendingCount}件が未実施</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-violet-500" />
              </CardContent>
            </Card>
          </Link>
        )}

        {/* 未対応インシデントアラート */}
        {openIncidentCount > 0 && (
          <Link href="/incidents">
            <Card className="border-red-200 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TriangleAlert className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium text-red-800">未対応のヒヤリハットがあります</p>
                    <p className="text-sm text-red-600">{openIncidentCount}件のインシデントが未対応です</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-red-500" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

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

        {/* 未公開連絡帳 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-blue-600" />
                未公開の連絡帳
                {unpublishedNotes.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{unpublishedNotes.length}件</Badge>
                )}
              </CardTitle>
              <Link href="/records" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                記録一覧 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {unpublishedNotes.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">未公開の連絡帳はありません</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {unpublishedNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/records/${note.children?.id}?date=${note.date}`}
                    className="flex items-center justify-between py-2 px-1 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-900 shrink-0">{note.children?.name}</span>
                      <span className="text-xs text-gray-500 truncate">{note.content.slice(0, 30)}…</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(note.date)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
