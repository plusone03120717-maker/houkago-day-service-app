import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { MonitoringRecordForm } from '@/components/support-plans/monitoring-record-form'
import { MonitoringRecordEditCard } from '@/components/support-plans/monitoring-record-edit-card'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
}

type MonitoringRecord = {
  id: string
  support_plan_id: string | null
  record_date: string
  long_term_progress: string | null
  short_term_progress: string | null
  issues: string | null
  next_actions: string | null
  overall_status: string
  created_at: string
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  ongoing: { label: '継続中', variant: 'secondary' },
  achieved: { label: '目標達成', variant: 'success' },
  revised: { label: '計画見直し', variant: 'warning' },
  needs_review: { label: '要検討', variant: 'destructive' },
}

export default async function MonitoringPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isReadOnly = (user?.user_metadata?.role as string | undefined) === 'staff'

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name')
    .eq('id', childId)
    .single()
  const child = childRaw as unknown as { id: string; name: string } | null
  if (!child) notFound()

  // 有効な支援計画を取得
  const { data: plansRaw } = await supabase
    .from('support_plans')
    .select('id, plan_date, review_date, status, long_term_goals, short_term_goals')
    .eq('child_id', childId)
    .in('status', ['active', 'reviewed'])
    .order('plan_date', { ascending: false })
  const plans = (plansRaw ?? []) as unknown as SupportPlan[]

  // 全モニタリング記録を取得（支援計画の有無に関わらず）
  const { data: recordsRaw } = await supabase
    .from('monitoring_records')
    .select('id, support_plan_id, record_date, long_term_progress, short_term_progress, issues, next_actions, overall_status, created_at')
    .eq('child_id', childId)
    .order('record_date', { ascending: false })
  const records = (recordsRaw ?? []) as unknown as MonitoringRecord[]

  // プランIDでグルーピング（nullは'__none__'キーで管理）
  const NULL_PLAN_KEY = '__none__'
  const recordsByPlan: Record<string, MonitoringRecord[]> = {}
  records.forEach((r) => {
    const key = r.support_plan_id ?? NULL_PLAN_KEY
    if (!recordsByPlan[key]) recordsByPlan[key] = []
    recordsByPlan[key].push(r)
  })
  const standaloneRecords = recordsByPlan[NULL_PLAN_KEY] ?? []

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/support-plans/${childId}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">モニタリング記録</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      {/* 進捗タイムライン */}
      {records.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              進捗タイムライン
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
              {[...records].reverse().map((rec, idx) => {
                const cfg = statusConfig[rec.overall_status] ?? statusConfig.ongoing
                const dotColors: Record<string, string> = {
                  ongoing:      'bg-blue-400',
                  achieved:     'bg-green-400',
                  revised:      'bg-yellow-400',
                  needs_review: 'bg-red-400',
                }
                return (
                  <div key={rec.id} className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[48px]">
                    <span className="text-xs text-gray-400 writing-mode-vertical" style={{ fontSize: '10px' }}>
                      {rec.record_date.slice(5).replace('-', '/')}
                    </span>
                    <div className={`w-4 h-4 rounded-full ${dotColors[rec.overall_status] ?? 'bg-gray-300'} flex-shrink-0`} title={cfg.label} />
                    {idx < records.length - 1 && (
                      <div className="w-full h-px bg-gray-200 absolute" />
                    )}
                  </div>
                )
              })}
            </div>
            {/* 凡例 */}
            <div className="flex gap-4 mt-2 flex-wrap">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    key === 'ongoing' ? 'bg-blue-400' :
                    key === 'achieved' ? 'bg-green-400' :
                    key === 'revised' ? 'bg-yellow-400' : 'bg-red-400'
                  }`} />
                  <span className="text-xs text-gray-500">{cfg.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 支援計画なしのスタンドアロン記録セクション（計画なし、または計画なし記録が存在する場合に表示） */}
      {(plans.length === 0 || standaloneRecords.length > 0) && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-600">
            {plans.length === 0 ? 'モニタリング記録' : '支援計画なしの記録'}
          </CardTitle>
          {plans.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">支援計画がない場合でもモニタリング記録を追加できます</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {standaloneRecords.length > 0 && (
            <div className="space-y-3">
              {standaloneRecords.map((record) => (
                <MonitoringRecordEditCard key={record.id} record={record} supportPlanId={null} childId={childId} readOnly={isReadOnly} />
              ))}
            </div>
          )}
          <MonitoringRecordForm supportPlanId={null} childId={childId} readOnly={isReadOnly} />
        </CardContent>
      </Card>}

      {plans.map((plan) => {
        const planRecords = recordsByPlan[plan.id] ?? []
        return (
          <Card key={plan.id}>
            <CardHeader className="pb-3">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {formatDate(plan.plan_date)} 作成の支援計画
                </CardTitle>
                {plan.review_date && (
                  <p className="text-xs text-gray-500">
                    見直し予定: {formatDate(plan.review_date)}
                  </p>
                )}
                {plan.long_term_goals && (
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    長期目標: {plan.long_term_goals}
                  </p>
                )}
                {plan.short_term_goals && (
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    短期目標: {plan.short_term_goals}
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 記録一覧 */}
              {planRecords.length > 0 && (
                <div className="space-y-3">
                  {planRecords.map((record) => (
                    <MonitoringRecordEditCard key={record.id} record={record} supportPlanId={plan.id} childId={childId} readOnly={isReadOnly} />
                  ))}
                </div>
              )}

              {/* 新規追加フォーム */}
              <MonitoringRecordForm supportPlanId={plan.id} childId={childId} readOnly={isReadOnly} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
