import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, ChevronRight, CheckCircle, Flag } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { DateNav } from '@/components/ui/date-nav'

type AttendedChild = {
  id: string
  child_id: string
  unit_id: string
  status: string
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

type DailyRecord = {
  id: string
  attendance_id: string
  has_notable_flag: boolean
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const supabase = await createClient()

  const targetDate = params.date ?? new Date().toISOString().slice(0, 10)

  // 当日の出席記録
  const { data: attendedRaw } = await supabase
    .from('daily_attendance')
    .select('id, child_id, unit_id, status, children(id, name, name_kana), units(id, name)')
    .eq('date', targetDate)
    .in('status', ['attended', 'absent'])
    .order('created_at')
  const attended = (attendedRaw ?? []) as unknown as AttendedChild[]

  // 既存の記録がある出席ID
  const attendanceIds = attended.map((a) => a.id)
  const { data: recordsRaw } = attendanceIds.length > 0
    ? await supabase
        .from('daily_records')
        .select('id, attendance_id, has_notable_flag')
        .in('attendance_id', attendanceIds)
    : { data: [] }
  const records = (recordsRaw ?? []) as unknown as DailyRecord[]

  const recordByAttendanceId = Object.fromEntries(
    records.map((r) => [r.attendance_id, r])
  )

  // ユニットでグループ
  const byUnit: Record<string, { unitName: string; items: AttendedChild[] }> = {}
  attended.forEach((a) => {
    const unitId = a.unit_id
    const unitName = a.units?.name ?? 'ユニット不明'
    if (!byUnit[unitId]) byUnit[unitId] = { unitName, items: [] }
    byUnit[unitId].items.push(a)
  })

  // 前後日
  const d = new Date(targetDate)
  const prevDate = new Date(d)
  prevDate.setDate(d.getDate() - 1)
  const nextDate = new Date(d)
  nextDate.setDate(d.getDate() + 1)

  const writtenCount = records.length
  const totalCount = attended.filter((a) => a.status === 'attended').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">日々の記録</h1>
        <p className="text-sm text-gray-500 mt-0.5">児童ごとの日報・活動記録・連絡帳</p>
      </div>

      {/* 日付ナビ */}
      <div className="flex items-center gap-3">
        <DateNav
          targetDate={targetDate}
          prevDate={prevDate.toISOString().slice(0, 10)}
          nextDate={nextDate.toISOString().slice(0, 10)}
          basePath="/records"
        />
        <span className="text-sm text-gray-500">{formatDate(targetDate, 'yyyy年MM月dd日')}</span>
        <span className="ml-auto text-sm text-gray-500">
          記録済 {writtenCount} / {totalCount} 名
        </span>
      </div>

      {attended.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          この日の出席記録がありません
        </div>
      ) : (
        Object.entries(byUnit).map(([unitId, { unitName, items }]) => (
          <div key={unitId}>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{unitName}</h2>
            <div className="space-y-2">
              {items.map((a) => {
                const record = recordByAttendanceId[a.id]
                const hasRecord = !!record
                const isAbsent = a.status === 'absent'

                return (
                  <Link
                    key={a.id}
                    href={`/records/${a.child_id}?date=${targetDate}&unit=${unitId}`}
                  >
                    <Card className={`hover:bg-gray-50 transition-colors cursor-pointer ${isAbsent ? 'opacity-60' : ''}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasRecord ? 'bg-green-100' : isAbsent ? 'bg-gray-100' : 'bg-orange-100'
                          }`}>
                            <BookOpen className={`h-4 w-4 ${
                              hasRecord ? 'text-green-600' : isAbsent ? 'text-gray-400' : 'text-orange-500'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{a.children?.name ?? '—'}</p>
                            {a.children?.name_kana && (
                              <p className="text-xs text-gray-400">{a.children.name_kana}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAbsent && (
                            <Badge variant="secondary" className="text-xs">欠席</Badge>
                          )}
                          {record?.has_notable_flag && (
                            <Flag className="h-4 w-4 text-yellow-500" />
                          )}
                          {hasRecord ? (
                            <Badge variant="success" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              記録済
                            </Badge>
                          ) : !isAbsent ? (
                            <Badge variant="warning" className="text-xs">未記録</Badge>
                          ) : null}
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
