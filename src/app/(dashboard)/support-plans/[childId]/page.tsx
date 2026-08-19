export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getSessionClaims } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, ClipboardList, FileDown } from 'lucide-react'
import { SupportPlanForm } from '@/components/support-plans/support-plan-form'
import { SupportPlanEditCard } from '@/components/support-plans/support-plan-edit-card'
import { NotableRecordsSummary } from '@/components/support-plans/notable-records-summary'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
  support_content: string | null
  support_health_life: string | null
  support_movement_sensory: string | null
  support_cognition_behavior: string | null
  support_language_communication: string | null
  support_social_relationships: string | null
  support_transition: string | null
  support_family: string | null
  support_goal_health_life: string | null
  support_goal_movement_sensory: string | null
  support_goal_cognition_behavior: string | null
  support_goal_language_communication: string | null
  support_goal_social_relationships: string | null
  support_goal_transition: string | null
  support_goal_family: string | null
  support_assignee_health_life: string | null
  support_assignee_movement_sensory: string | null
  support_assignee_cognition_behavior: string | null
  support_assignee_language_communication: string | null
  support_assignee_social_relationships: string | null
  support_assignee_transition: string | null
  support_assignee_family: string | null
  support_priority_health_life: string | null
  support_priority_movement_sensory: string | null
  support_priority_cognition_behavior: string | null
  support_priority_language_communication: string | null
  support_priority_social_relationships: string | null
  support_priority_transition: string | null
  support_priority_family: string | null
  support_achievement_health_life: string | null
  support_achievement_movement_sensory: string | null
  support_achievement_cognition_behavior: string | null
  support_achievement_language_communication: string | null
  support_achievement_social_relationships: string | null
  support_achievement_transition: string | null
  support_achievement_family: string | null
  support_kasan_health_life: string | null
  support_kasan_movement_sensory: string | null
  support_kasan_cognition_behavior: string | null
  support_kasan_language_communication: string | null
  support_kasan_social_relationships: string | null
  support_kasan_transition: string | null
  support_kasan_family: string | null
  support_evaluation_health_life: string | null
  support_evaluation_movement_sensory: string | null
  support_evaluation_cognition_behavior: string | null
  support_evaluation_language_communication: string | null
  support_evaluation_social_relationships: string | null
  support_evaluation_transition: string | null
  support_evaluation_family: string | null
  support_specialized: string | null
  manager_name: string | null
  standard_service_time: string | null
  family_wishes: string | null
  support_policy: string | null
  monitoring_notes: string | null
  long_term_goal_rating: number | null
  short_term_goal_rating: number | null
  created_at: string
}

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string | null
  diagnosis: string | null
}

export default async function SupportPlanDetailPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()
  const claims = await getSessionClaims()
  const isReadOnly = claims?.role === 'staff'

  // 直近3ヶ月の特記事項の範囲
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10)

  // 児童・支援計画・特記事項はいずれも childId だけで引けるので並列取得
  const [{ data: childRaw }, { data: plansRaw }, { data: notableRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, diagnosis')
      .eq('id', childId)
      .single(),
    supabase
      .from('support_plans')
      .select('id, plan_date, review_date, status, long_term_goals, short_term_goals, support_content, support_health_life, support_movement_sensory, support_cognition_behavior, support_language_communication, support_social_relationships, support_transition, support_family, support_goal_health_life, support_goal_movement_sensory, support_goal_cognition_behavior, support_goal_language_communication, support_goal_social_relationships, support_goal_transition, support_goal_family, support_assignee_health_life, support_assignee_movement_sensory, support_assignee_cognition_behavior, support_assignee_language_communication, support_assignee_social_relationships, support_assignee_transition, support_assignee_family, support_priority_health_life, support_priority_movement_sensory, support_priority_cognition_behavior, support_priority_language_communication, support_priority_social_relationships, support_priority_transition, support_priority_family, support_achievement_health_life, support_achievement_movement_sensory, support_achievement_cognition_behavior, support_achievement_language_communication, support_achievement_social_relationships, support_achievement_transition, support_achievement_family, support_kasan_health_life, support_kasan_movement_sensory, support_kasan_cognition_behavior, support_kasan_language_communication, support_kasan_social_relationships, support_kasan_transition, support_kasan_family, support_evaluation_health_life, support_evaluation_movement_sensory, support_evaluation_cognition_behavior, support_evaluation_language_communication, support_evaluation_social_relationships, support_evaluation_transition, support_evaluation_family, support_specialized, manager_name, standard_service_time, family_wishes, support_policy, monitoring_notes, long_term_goal_rating, short_term_goal_rating, created_at')
      .eq('child_id', childId)
      .order('plan_date', { ascending: false }),
    supabase
      .from('daily_attendance')
      .select('date, daily_records!inner(content, record_type)')
      .eq('child_id', childId)
      .gte('date', threeMonthsAgoStr)
      .eq('daily_records.record_type', 'notable')
      .order('date', { ascending: false }),
  ])

  const child = childRaw as unknown as Child | null
  if (!child) return <div className="p-4 text-gray-500">児童が見つかりません</div>

  const plans = (plansRaw ?? []) as unknown as SupportPlan[]

  type NotableRow = { date: string; daily_records: { content: string; record_type: string } | { content: string; record_type: string }[] }
  const notableRecords = ((notableRaw ?? []) as unknown as NotableRow[]).flatMap((row) => {
    const records = Array.isArray(row.daily_records) ? row.daily_records : [row.daily_records]
    return records
      .filter((r) => r.record_type === 'notable')
      .map((r) => ({ date: row.date, content: r.content }))
  })

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/support-plans" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{child.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">個別支援計画</p>
        </div>
        <Link
          href={`/print/support-plan/${childId}`}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
        >
          <FileDown className="h-4 w-4" />
          PDF作成
        </Link>
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

      {/* 特記事項まとめ */}
      <NotableRecordsSummary records={notableRecords} />

      {/* 新規作成フォーム */}
      <SupportPlanForm
        childId={childId}
        childName={child.name}
        diagnosis={child.diagnosis}
        readOnly={isReadOnly}
      />

      {/* 既存の計画一覧（編集可能） */}
      {plans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-700">過去の支援計画</h2>
          {plans.map((plan) => (
            <SupportPlanEditCard key={plan.id} plan={plan} childId={childId} readOnly={isReadOnly} />
          ))}
        </div>
      )}
    </div>
  )
}
