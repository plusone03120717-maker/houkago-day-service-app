import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, ClipboardList } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { SupportPlanForm } from '@/components/support-plans/support-plan-form'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
  support_content: string | null
  monitoring_notes: string | null
  created_at: string
}

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string | null
  diagnosis: string | null
}

const statusLabel: Record<string, string> = {
  draft: '下書き',
  active: '有効',
  reviewed: '見直し済',
  archived: '保存',
}

const statusVariant: Record<string, 'secondary' | 'success' | 'warning' | 'default'> = {
  draft: 'secondary',
  active: 'success',
  reviewed: 'warning',
  archived: 'secondary',
}

export default async function SupportPlanDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name, name_kana, birth_date, diagnosis')
    .eq('id', childId)
    .single()
  const child = childRaw as unknown as Child | null

  if (!child) return <div className="p-4 text-gray-500">児童が見つかりません</div>

  const { data: plansRaw } = await supabase
    .from('support_plans')
    .select('id, plan_date, review_date, status, long_term_goals, short_term_goals, support_content, monitoring_notes, created_at')
    .eq('child_id', childId)
    .order('plan_date', { ascending: false })
  const plans = (plansRaw ?? []) as unknown as SupportPlan[]

  // 最新の日々の記録（AI下書き用）
  const { data: recentRecordsRaw } = await supabase
    .from('daily_records')
    .select('date, activities, notable_events, contact_note')
    .eq('child_id', childId)
    .order('date', { ascending: false })
    .limit(10)
  const recentRecords = (recentRecordsRaw ?? []) as unknown as Array<{
    date: string
    activities: unknown[]
    notable_events: string | null
    contact_note: string | null
  }>

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/support-plans" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">個別支援計画</p>
        </div>
      </div>

      {/* モニタリング記録へのリンク */}
      <Link href={`/support-plans/${childId}/monitoring`}>
        <Card className="hover:bg-gray-50 transition-colors cursor-pointer border-indigo-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">モニタリング記録</p>
              <p className="text-xs text-gray-500">支援目標の達成状況・進捗を記録</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 新規作成フォーム */}
      <SupportPlanForm
        childId={childId}
        childName={child.name}
        diagnosis={child.diagnosis}
        recentRecords={recentRecords}
      />

      {/* 既存の計画一覧 */}
      {plans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-700">過去の支援計画</h2>
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {formatDate(plan.plan_date)} 作成
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {plan.review_date && (
                      <span className="text-xs text-gray-500">
                        見直し予定: {formatDate(plan.review_date)}
                      </span>
                    )}
                    <Badge variant={statusVariant[plan.status] ?? 'secondary'}>
                      {statusLabel[plan.status] ?? plan.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {plan.long_term_goals && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">長期目標</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{plan.long_term_goals}</p>
                  </div>
                )}
                {plan.short_term_goals && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">短期目標</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{plan.short_term_goals}</p>
                  </div>
                )}
                {plan.support_content && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">支援内容</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{plan.support_content}</p>
                  </div>
                )}
                {plan.monitoring_notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">モニタリング</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{plan.monitoring_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
