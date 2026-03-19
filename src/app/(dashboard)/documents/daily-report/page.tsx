import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, CheckCircle } from 'lucide-react'

type DailyReport = {
  report_date: string
  safety_check: boolean
}

export default async function DailyReportListPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const supabase = await createClient()

  const { data: reportsRaw } = await supabase
    .from('daily_reports')
    .select('report_date, safety_check')
    .gte('report_date', startDate)
    .lte('report_date', endDate)
  const reports = (reportsRaw ?? []) as unknown as DailyReport[]

  const reportMap: Record<string, DailyReport> = {}
  reports.forEach((r) => { reportMap[r.report_date] = r })

  // 月の日付一覧
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })

  const today = now.toISOString().slice(0, 10)

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/documents" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">業務日報</h1>
          <p className="text-sm text-gray-500 mt-0.5">日別の業務記録・安全確認</p>
        </div>
      </div>

      {/* 月選択 */}
      <div className="flex items-center gap-3">
        <Link
          href={`/documents/daily-report?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold min-w-[80px] text-center">
          {year}年{month}月
        </span>
        <Link
          href={`/documents/daily-report?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        <span className="text-xs text-gray-400 ml-2">
          記録済: {reports.length}/{daysInMonth}日
        </span>
      </div>

      <div className="space-y-2">
        {days.map((date) => {
          const report = reportMap[date]
          const isToday = date === today
          const d = new Date(date)
          const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
          const isSun = d.getDay() === 0
          const isSat = d.getDay() === 6

          return (
            <Link key={date} href={`/documents/daily-report/${date}`}>
              <Card className={`hover:bg-gray-50 transition-colors cursor-pointer ${isToday ? 'ring-2 ring-indigo-400' : ''}`}>
                <CardContent className="p-3 flex items-center gap-4">
                  <div className="w-14 text-center flex-shrink-0">
                    <span className={`text-sm font-medium ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                      {d.getDate()}日({dayOfWeek})
                    </span>
                    {isToday && (
                      <div className="text-xs text-indigo-500 font-medium">今日</div>
                    )}
                  </div>

                  <div className="flex-1">
                    {report ? (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm text-gray-700">記録済み</span>
                        {report.safety_check && (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span className="text-xs">安全確認済</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">未記録</span>
                    )}
                  </div>

                  <span className="text-xs text-indigo-500">
                    {report ? '編集 →' : '記録する →'}
                  </span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
