import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, ChevronRight, AlertCircle, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
}

type ChildWithPlan = {
  id: string
  name: string
  name_kana: string | null
  support_plans: SupportPlan[]
}

type MonitoringRecord = {
  id: string
  child_id: string
  support_plan_id: string
  record_date: string
  overall_status: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ongoing:      { label: '継続中',     color: 'text-blue-600',   dot: 'bg-blue-400' },
  achieved:     { label: '目標達成',   color: 'text-green-600',  dot: 'bg-green-400' },
  revised:      { label: '計画見直し', color: 'text-yellow-600', dot: 'bg-yellow-400' },
  needs_review: { label: '要検討',     color: 'text-red-600',    dot: 'bg-red-400' },
}

export default async function SupportPlansPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: childrenRaw }, { data: monitoringRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, support_plans(id, plan_date, review_date, status)')
      .eq('is_active', true)
      .order('name_kana'),
    supabase
      .from('monitoring_records')
      .select('id, child_id, support_plan_id, record_date, overall_status')
      .order('record_date', { ascending: false }),
  ])

  const children = (childrenRaw ?? []) as unknown as ChildWithPlan[]
  const allMonitoring = (monitoringRaw ?? []) as unknown as MonitoringRecord[]

  // 児童ごとの最新モニタリング状況
  const latestMonitoringByChild = new Map<string, MonitoringRecord>()
  const monitoringCountByChild = new Map<string, number>()
  for (const rec of allMonitoring) {
    monitoringCountByChild.set(rec.child_id, (monitoringCountByChild.get(rec.child_id) ?? 0) + 1)
    if (!latestMonitoringByChild.has(rec.child_id)) {
      latestMonitoringByChild.set(rec.child_id, rec)
    }
  }

  const today = new Date()
  const threeMonthsLater = new Date(today)
  threeMonthsLater.setMonth(today.getMonth() + 3)

  // 全体集計
  const statusSummary = { ongoing: 0, achieved: 0, revised: 0, needs_review: 0, no_monitoring: 0 }
  for (const child of children) {
    const latest = latestMonitoringByChild.get(child.id)
    if (!latest) {
      statusSummary.no_monitoring++
    } else {
      const key = latest.overall_status as keyof typeof statusSummary
      if (key in statusSummary) statusSummary[key]++
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">個別支援計画</h1>
        <p className="text-sm text-gray-500 mt-0.5">児童ごとの支援計画管理・AI下書き</p>
      </div>

      {/* 進捗サマリー */}
      {children.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              モニタリング進捗サマリー（全{children.length}名）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = statusSummary[key as keyof typeof statusSummary]
                const pct = children.length > 0 ? Math.round((count / children.length) * 100) : 0
                return (
                  <div key={key} className="flex-1 min-w-[100px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className="text-xs text-gray-500">{cfg.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${cfg.color}`}>{count}<span className="text-xs font-normal text-gray-400 ml-0.5">名</span></p>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {statusSummary.no_monitoring > 0 && (
                <div className="flex-1 min-w-[100px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-200" />
                    <span className="text-xs text-gray-500">未記録</span>
                  </div>
                  <p className="text-xl font-bold text-gray-400">{statusSummary.no_monitoring}<span className="text-xs font-normal text-gray-400 ml-0.5">名</span></p>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gray-300"
                      style={{ width: `${Math.round((statusSummary.no_monitoring / children.length) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 児童一覧 */}
      <div className="space-y-2">
        {children.map((child) => {
          const plans = (child.support_plans ?? []).sort((a, b) =>
            b.plan_date.localeCompare(a.plan_date)
          )
          const latestPlan = plans[0]
          const reviewDate = latestPlan?.review_date ? new Date(latestPlan.review_date) : null
          const needsReview = reviewDate ? reviewDate <= threeMonthsLater : !latestPlan
          const latestMonitoring = latestMonitoringByChild.get(child.id)
          const monCount = monitoringCountByChild.get(child.id) ?? 0
          const statusCfg = latestMonitoring ? STATUS_CONFIG[latestMonitoring.overall_status] : null

          return (
            <Link key={child.id} href={`/support-plans/${child.id}`}>
              <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900">{child.name}</p>
                      {statusCfg && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      )}
                      {!latestMonitoring && latestPlan && (
                        <span className="text-xs text-gray-400">モニタリング未記録</span>
                      )}
                    </div>
                    {child.name_kana && (
                      <p className="text-xs text-gray-400">{child.name_kana}</p>
                    )}
                    {latestMonitoring && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        最終記録: {formatDate(latestMonitoring.record_date)}
                        {monCount > 1 && ` （全${monCount}件）`}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {latestPlan ? (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          作成: {formatDate(latestPlan.plan_date)}
                        </p>
                        {latestPlan.review_date && (
                          <p className={`text-xs ${needsReview ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                            見直し: {formatDate(latestPlan.review_date)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Badge variant="warning" className="text-xs">未作成</Badge>
                    )}
                    {needsReview && (
                      <AlertCircle className="h-4 w-4 text-orange-400" />
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}

        {children.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            登録された児童がいません
          </div>
        )}
      </div>
    </div>
  )
}
