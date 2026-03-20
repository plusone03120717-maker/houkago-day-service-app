import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { FacilityEventForm } from '@/components/settings/facility-event-form'
import { FacilityEventDeleteButton } from '@/components/settings/facility-event-delete-button'

type FacilityEvent = {
  id: string
  event_date: string
  event_type: string
  title: string
  description: string | null
  affects_reservation: boolean
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' | 'default' | 'success' }> = {
  closed: { label: '休業日', variant: 'destructive' },
  half_day: { label: '短縮営業', variant: 'warning' },
  event: { label: '行事', variant: 'default' },
  training: { label: '職員研修', variant: 'secondary' },
  holiday: { label: '祝日', variant: 'secondary' },
}

export default async function FacilityCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const supabase = await createClient()

  const [facilityResult, eventsResult] = await Promise.all([
    supabase.from('facilities').select('id, name').limit(1).single(),
    supabase
      .from('facility_events')
      .select('id, event_date, event_type, title, description, affects_reservation')
      .gte('event_date', monthStart)
      .lte('event_date', monthEnd)
      .order('event_date'),
  ])

  const facilityId = (facilityResult.data as { id: string } | null)?.id ?? ''
  const events = (eventsResult.data ?? []) as unknown as FacilityEvent[]

  // カレンダーグリッド用データ
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = new Date(year, month - 1, 1).getDay()
  const eventMap = new Map<string, FacilityEvent[]>()
  for (const e of events) {
    const arr = eventMap.get(e.event_date) ?? []
    arr.push(e)
    eventMap.set(e.event_date, arr)
  }

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">施設カレンダー管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">休業日・行事・研修日の登録</p>
        </div>
      </div>

      {/* 月ナビゲーション */}
      <div className="flex items-center gap-2">
        <Link
          href={`/settings/calendar?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
        >
          ‹
        </Link>
        <span className="text-sm font-semibold min-w-[80px] text-center">{year}年{month}月</span>
        <Link
          href={`/settings/calendar?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
        >
          ›
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* カレンダービュー */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((d, i) => (
                <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const d = i + 1
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const dow = new Date(dateStr).getDay()
                const dayEvents = eventMap.get(dateStr) ?? []
                const isClosed = dayEvents.some((e) => e.event_type === 'closed')
                const isToday = dateStr === now.toISOString().slice(0, 10)
                return (
                  <div
                    key={d}
                    className={`text-center py-1 rounded text-xs ${
                      isClosed ? 'bg-red-100' :
                      dayEvents.length > 0 ? 'bg-indigo-50' :
                      dow === 0 ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : ''
                    } ${isToday ? 'ring-1 ring-indigo-400' : ''}`}
                  >
                    <span className={`font-medium ${
                      isClosed ? 'text-red-600' :
                      dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
                    }`}>
                      {d}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mx-auto mt-0.5" />
                    )}
                  </div>
                )
              })}
            </div>

            {/* 凡例 */}
            <div className="flex gap-3 flex-wrap mt-3 text-xs text-gray-500">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100" />休業日</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-indigo-50" />行事・研修等</div>
            </div>
          </CardContent>
        </Card>

        {/* 登録フォーム */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-600" />
              予定を追加
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FacilityEventForm facilityId={facilityId} defaultYear={year} defaultMonth={month} />
          </CardContent>
        </Card>
      </div>

      {/* 当月の予定一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{year}年{month}月の予定一覧（{events.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">登録された予定はありません</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => {
                const conf = EVENT_TYPE_CONFIG[ev.event_type] ?? { label: ev.event_type, variant: 'secondary' as const }
                return (
                  <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="w-16 text-xs font-medium text-gray-500 flex-shrink-0">
                      {formatDate(ev.event_date, 'MM月dd日')}
                    </div>
                    <Badge variant={conf.variant} className="text-xs flex-shrink-0">{conf.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                      {ev.description && (
                        <p className="text-xs text-gray-500 truncate">{ev.description}</p>
                      )}
                    </div>
                    {ev.affects_reservation && (
                      <span className="text-xs text-red-500 flex-shrink-0">予約停止</span>
                    )}
                    <FacilityEventDeleteButton eventId={ev.id} />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

