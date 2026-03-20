import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type AttendanceRecord = {
  id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  units: { name: string } | null
  children: { name: string } | null
}

type BenefitCert = {
  max_days_per_month: number
  start_date: string
  end_date: string
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)
  const today = now.toISOString().slice(0, 10)

  // 自分の子どものID取得
  const { data: parentChildrenRaw } = await supabase
    .from('parent_children')
    .select('child_id, children(id, name)')
    .eq('user_id', user.id)
  const childEntries = (parentChildrenRaw ?? []) as unknown as { child_id: string; children: { id: string; name: string } | null }[]
  const childIds = childEntries.map((e) => e.child_id)

  if (childIds.length === 0) {
    return (
      <div className="pb-20 sm:pb-5 px-4 py-6 text-center text-gray-400 text-sm">
        お子様の情報がありません
      </div>
    )
  }

  // 出席記録
  const { data: attendanceRaw } = await supabase
    .from('daily_attendance')
    .select('id, date, status, check_in_time, check_out_time, units(name), children(name)')
    .in('child_id', childIds)
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .eq('status', 'attended')
    .order('date')
  const attendances = (attendanceRaw ?? []) as unknown as AttendanceRecord[]

  // 受給者証（今月有効なもの）
  const { data: certsRaw } = await supabase
    .from('benefit_certificates')
    .select('max_days_per_month, start_date, end_date')
    .in('child_id', childIds)
    .lte('start_date', monthEnd)
    .gte('end_date', monthStart)
  const certs = (certsRaw ?? []) as unknown as BenefitCert[]
  const maxDays = certs.length > 0 ? Math.max(...certs.map((c) => c.max_days_per_month)) : null

  const attendedDates = new Set(attendances.map((a) => a.date))
  const attendedCount = attendedDates.size
  const remaining = maxDays != null ? maxDays - attendedCount : null

  // カレンダー用
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = new Date(year, month - 1, 1).getDay()

  const multipleChildren = childIds.length > 1
  const childAttendanceMap = new Map<string, AttendanceRecord>()
  for (const a of attendances) {
    childAttendanceMap.set(a.date, a)
  }

  return (
    <div className="pb-20 sm:pb-5 space-y-4 px-1">
      <div className="flex items-center justify-between px-3 pt-2">
        <h1 className="text-lg font-bold text-gray-900">出席記録</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/parent/attendance?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold min-w-[72px] text-center">
            {year}年{month}月
          </span>
          <Link
            href={`/parent/attendance?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 給付日数サマリ */}
      {maxDays != null && (
        <Card className="mx-3">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-indigo-600">{attendedCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">出席日数</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-700">{maxDays}</p>
                <p className="text-xs text-gray-500 mt-0.5">給付日数上限</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${(remaining ?? 0) <= 3 ? 'text-orange-500' : 'text-green-600'}`}>
                  {remaining}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">残り日数</p>
              </div>
            </div>
            {/* プログレスバー */}
            <div className="mt-3">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    attendedCount >= maxDays ? 'bg-red-400' :
                    (remaining ?? 0) <= 3 ? 'bg-orange-400' : 'bg-indigo-400'
                  }`}
                  style={{ width: `${Math.min(100, (attendedCount / maxDays) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">
                {Math.round((attendedCount / maxDays) * 100)}% 消化
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* カレンダー */}
      <Card className="mx-3">
        <CardContent className="p-4">
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-medium py-1 ${
                  i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
                }`}
              >
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
              const isAttended = attendedDates.has(dateStr)
              const isToday = dateStr === today
              const isFuture = dateStr > today

              return (
                <div
                  key={d}
                  className={`aspect-square flex items-center justify-center rounded-full text-xs font-medium ${
                    isAttended
                      ? 'bg-indigo-500 text-white'
                      : isToday
                        ? 'ring-2 ring-indigo-400 text-indigo-600'
                        : isFuture
                          ? 'text-gray-300'
                          : dow === 0
                            ? 'text-red-400'
                            : dow === 6
                              ? 'text-blue-400'
                              : 'text-gray-500'
                  }`}
                >
                  {d}
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              出席
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full ring-2 ring-indigo-400" />
              今日
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 出席一覧 */}
      {attendances.length > 0 && (
        <Card className="mx-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">出席日一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {attendances.map((att) => (
                <div key={att.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {att.date.slice(5).replace('-', '/')}
                      {' '}
                      <span className="font-normal text-gray-500 text-xs">
                        {DAY_LABELS[new Date(att.date).getDay()]}
                      </span>
                    </p>
                    {multipleChildren && att.children && (
                      <p className="text-xs text-gray-400">{att.children.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {att.check_in_time && att.check_out_time && (
                      <span>
                        {att.check_in_time.slice(0, 5)}〜{att.check_out_time.slice(0, 5)}
                      </span>
                    )}
                    {att.units && (
                      <Badge variant="secondary" className="text-xs">{att.units.name}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {attendances.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm mx-3">
          この月の出席記録はありません
        </div>
      )}
    </div>
  )
}
