import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, AlertTriangle, ClipboardList, Car } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = formatDate(new Date(), 'yyyy-MM-dd')

  // 今日の利用予定を取得
  const { data: todayReservations } = await supabase
    .from('usage_reservations')
    .select(`
      id,
      child_id,
      unit_id,
      status,
      children (name),
      units (name)
    `)
    .eq('date', today)
    .in('status', ['confirmed', 'reserved'])

  // 受給者証期限切れ間近（30日以内）を取得
  const thirtyDaysLater = new Date()
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)
  const { data: expiringCerts } = await supabase
    .from('benefit_certificates')
    .select(`
      id,
      end_date,
      child_id,
      children (name)
    `)
    .lte('end_date', formatDate(thirtyDaysLater, 'yyyy-MM-dd'))
    .gte('end_date', today)
    .order('end_date', { ascending: true })

  // 特記事項ありの記録（直近7日）
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const { data: notableRecords } = await supabase
    .from('daily_records')
    .select(`
      id,
      content,
      created_at,
      daily_attendance (
        date,
        children (name)
      )
    `)
    .eq('has_notable_flag', true)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  const todayCount = todayReservations?.length ?? 0
  const expiringCount = expiringCerts?.length ?? 0
  const notableCount = notableRecords?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate(new Date(), 'yyyy年MM月dd日')}</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">本日の利用予定</p>
              <p className="text-2xl font-bold text-gray-900">{todayCount}<span className="text-sm font-normal text-gray-500 ml-1">名</span></p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">受給者証期限切れ間近</p>
              <p className="text-2xl font-bold text-gray-900">{expiringCount}<span className="text-sm font-normal text-gray-500 ml-1">件</span></p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClipboardList className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">特記事項（直近7日）</p>
              <p className="text-2xl font-bold text-gray-900">{notableCount}<span className="text-sm font-normal text-gray-500 ml-1">件</span></p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <Car className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">本日の送迎</p>
              <p className="text-2xl font-bold text-gray-900">-<span className="text-sm font-normal text-gray-500 ml-1">台</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 受給者証期限切れ間近 */}
        {expiringCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                受給者証の期限切れ間近
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiringCerts?.map((cert) => {
                  const daysLeft = Math.ceil(
                    (new Date(cert.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  )
                  return (
                    <div key={cert.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm font-medium text-gray-900">
                        {(cert.children as { name: string } | null)?.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatDate(cert.end_date)}</span>
                        <Badge variant={daysLeft <= 7 ? 'destructive' : 'warning'}>
                          残り{daysLeft}日
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 特記事項 */}
        {notableCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <ClipboardList className="h-5 w-5" />
                最近の特記事項
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notableRecords?.map((record) => {
                  const attendance = record.daily_attendance as { date: string; children: { name: string } | null } | null
                  return (
                    <div key={record.id} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {attendance?.children?.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {attendance?.date ? formatDate(attendance.date) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">{record.content}</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 本日の利用予定 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              本日の利用予定
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayCount === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">本日の利用予定はありません</p>
            ) : (
              <div className="space-y-1">
                {todayReservations?.map((res) => {
                  const child = res.children as { name: string } | null
                  const unit = res.units as { name: string } | null
                  return (
                    <div key={res.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-900">{child?.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{unit?.name}</span>
                        <Badge variant="secondary">{res.status === 'confirmed' ? '確定' : '予約済'}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
