import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintOptions } from '@/components/documents/print-options'
import { SupportPlanDocument } from '@/components/documents/support-plan-document'
import { formatDate } from '@/lib/utils'

type Child = { id: string; name: string }

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  long_term_goals: string | null
  short_term_goals: string | null
  family_wishes: string | null
  child_wishes: string | null
  support_policy: string | null
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
  manager_name: string | null
  standard_service_time: string | null
  users: { name: string } | null
}

const SUPPORT_AREAS: { key: keyof SupportPlan; goalKey: keyof SupportPlan; assigneeKey: keyof SupportPlan; priorityKey: keyof SupportPlan; achievementKey: keyof SupportPlan; kasanKey: keyof SupportPlan; evaluationKey: keyof SupportPlan; label: string; defaultKasan: string }[] = [
  { key: 'support_health_life',            goalKey: 'support_goal_health_life',            assigneeKey: 'support_assignee_health_life',            priorityKey: 'support_priority_health_life',            achievementKey: 'support_achievement_health_life',            kasanKey: 'support_kasan_health_life',            evaluationKey: 'support_evaluation_health_life',            label: '本人支援\n（健康・生活）',              defaultKasan: '医療連携体制加算' },
  { key: 'support_movement_sensory',       goalKey: 'support_goal_movement_sensory',       assigneeKey: 'support_assignee_movement_sensory',       priorityKey: 'support_priority_movement_sensory',       achievementKey: 'support_achievement_movement_sensory',       kasanKey: 'support_kasan_movement_sensory',       evaluationKey: 'support_evaluation_movement_sensory',       label: '本人支援\n（運動・感覚）',              defaultKasan: '専門的支援実施加算' },
  { key: 'support_cognition_behavior',     goalKey: 'support_goal_cognition_behavior',     assigneeKey: 'support_assignee_cognition_behavior',     priorityKey: 'support_priority_cognition_behavior',     achievementKey: 'support_achievement_cognition_behavior',     kasanKey: 'support_kasan_cognition_behavior',     evaluationKey: 'support_evaluation_cognition_behavior',     label: '本人支援\n（認知・行動）',              defaultKasan: '' },
  { key: 'support_language_communication', goalKey: 'support_goal_language_communication', assigneeKey: 'support_assignee_language_communication', priorityKey: 'support_priority_language_communication', achievementKey: 'support_achievement_language_communication', kasanKey: 'support_kasan_language_communication', evaluationKey: 'support_evaluation_language_communication', label: '本人支援\n（言語・コミュニケーション）', defaultKasan: '' },
  { key: 'support_social_relationships',   goalKey: 'support_goal_social_relationships',   assigneeKey: 'support_assignee_social_relationships',   priorityKey: 'support_priority_social_relationships',   achievementKey: 'support_achievement_social_relationships',   kasanKey: 'support_kasan_social_relationships',   evaluationKey: 'support_evaluation_social_relationships',   label: '本人支援\n（人間関係・社会性）',        defaultKasan: '' },
  { key: 'support_transition',             goalKey: 'support_goal_transition',             assigneeKey: 'support_assignee_transition',             priorityKey: 'support_priority_transition',             achievementKey: 'support_achievement_transition',             kasanKey: 'support_kasan_transition',             evaluationKey: 'support_evaluation_transition',             label: '本人支援\n（移行支援）',               defaultKasan: '' },
  { key: 'support_family',                 goalKey: 'support_goal_family',                 assigneeKey: 'support_assignee_family',                 priorityKey: 'support_priority_family',                 achievementKey: 'support_achievement_family',                 kasanKey: 'support_kasan_family',                 evaluationKey: 'support_evaluation_family',                 label: '家族支援',                            defaultKasan: '家族支援加算' },
]

export default async function PrintSupportPlanPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const { childId } = await params
  const supabase = await createClient()

  const [childResult, plansResult] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).single(),
    supabase
      .from('support_plans')
      .select('id, plan_date, review_date, long_term_goals, short_term_goals, family_wishes, child_wishes, support_policy, support_health_life, support_movement_sensory, support_cognition_behavior, support_language_communication, support_social_relationships, support_transition, support_family, support_goal_health_life, support_goal_movement_sensory, support_goal_cognition_behavior, support_goal_language_communication, support_goal_social_relationships, support_goal_transition, support_goal_family, support_assignee_health_life, support_assignee_movement_sensory, support_assignee_cognition_behavior, support_assignee_language_communication, support_assignee_social_relationships, support_assignee_transition, support_assignee_family, support_priority_health_life, support_priority_movement_sensory, support_priority_cognition_behavior, support_priority_language_communication, support_priority_social_relationships, support_priority_transition, support_priority_family, support_achievement_health_life, support_achievement_movement_sensory, support_achievement_cognition_behavior, support_achievement_language_communication, support_achievement_social_relationships, support_achievement_transition, support_achievement_family, support_kasan_health_life, support_kasan_movement_sensory, support_kasan_cognition_behavior, support_kasan_language_communication, support_kasan_social_relationships, support_kasan_transition, support_kasan_family, support_evaluation_health_life, support_evaluation_movement_sensory, support_evaluation_cognition_behavior, support_evaluation_language_communication, support_evaluation_social_relationships, support_evaluation_transition, support_evaluation_family, manager_name, standard_service_time, users!support_plans_created_by_fkey(name)')
      .eq('child_id', childId)
      .in('status', ['active', 'reviewed'])
      .order('plan_date', { ascending: false })
      .limit(1),
  ])

  if (!childResult.data) notFound()
  const child = childResult.data as unknown as Child
  const plan  = (plansResult.data?.[0] ?? null) as unknown as SupportPlan | null

  const reviewDate  = plan?.review_date ? formatDate(plan.review_date, 'yyyy年MM月dd日') : ''
  const planDate    = plan ? formatDate(plan.plan_date, 'yyyy年MM月dd日') : ''
  const managerName = plan?.manager_name || plan?.users?.name || ''
  const wishes      = [plan?.child_wishes, plan?.family_wishes].filter(Boolean).join('\n') || ''

  const standardServiceTime = plan?.standard_service_time || ''

  const docData = plan ? {
    planId:        plan.id,
    childName:     child.name,
    planDate,
    reviewDate,
    wishes,
    standardServiceTime,
    supportPolicy:  plan.support_policy   || '',
    longTermGoals:  plan.long_term_goals  || '',
    shortTermGoals: plan.short_term_goals || '',
    managerName,
    areas: SUPPORT_AREAS.map((area) => ({
      label:           area.label,
      goal:            (plan[area.goalKey] as string)        || '',
      content:         (plan[area.key] as string)            || '',
      assignee:        (plan[area.assigneeKey] as string)    || '',
      priority:        (plan[area.priorityKey] as string)    || '',
      achievement:     (plan[area.achievementKey] as string) || '',
      kasan:            (plan[area.kasanKey] as string)        || area.defaultKasan,
      evaluation:       (plan[area.evaluationKey] as string)  || '',
      dbKey:            area.key as string,
      goalDbKey:       area.goalKey as string,
      assigneeDbKey:   area.assigneeKey as string,
      priorityDbKey:   area.priorityKey as string,
      achievementDbKey:  area.achievementKey as string,
      kasanDbKey:        area.kasanKey as string,
      evaluationDbKey:   area.evaluationKey as string,
    })),
  } : null

  return (
    <>
      {/* 印刷用グローバルスタイル */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }
          #doc-wrapper {
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      {/* 操作バー（印刷時は非表示） */}
      <div className="print:hidden flex items-start gap-4 p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <Link
          href={`/support-plans/${childId}`}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{child.name} — 個別支援計画書</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {plan ? `${planDate} 作成の計画` : '有効な支援計画がありません'}
          </p>
        </div>
        {docData && <PrintOptions />}
      </div>

      {!plan && (
        <div className="print:hidden text-center py-16 text-gray-400 text-sm">
          有効な支援計画がありません。
        </div>
      )}

      {docData && (
        <div id="doc-wrapper" style={{ width: '200mm', margin: '8mm auto', padding: '0 4mm' }}>
          <SupportPlanDocument data={docData} />
        </div>
      )}
    </>
  )
}
