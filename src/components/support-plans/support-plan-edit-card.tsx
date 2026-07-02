'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Wand2, ChevronUp, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { StarRating } from '@/components/ui/star-rating'

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
  family_wishes: string | null
  support_policy: string | null
  manager_name: string | null
  standard_service_time: string | null
  monitoring_notes: string | null
  long_term_goal_rating: number | null
  short_term_goal_rating: number | null
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

const AREAS = [
  { key: 'support_health_life' as const,            goalKey: 'support_goal_health_life' as const,            assigneeKey: 'support_assignee_health_life' as const,            priorityKey: 'support_priority_health_life' as const,            achievementKey: 'support_achievement_health_life' as const,            kasanKey: 'support_kasan_health_life' as const,            evaluationKey: 'support_evaluation_health_life' as const,            label: '① 健康・生活',              defaultKasan: '' },
  { key: 'support_movement_sensory' as const,       goalKey: 'support_goal_movement_sensory' as const,       assigneeKey: 'support_assignee_movement_sensory' as const,       priorityKey: 'support_priority_movement_sensory' as const,       achievementKey: 'support_achievement_movement_sensory' as const,       kasanKey: 'support_kasan_movement_sensory' as const,       evaluationKey: 'support_evaluation_movement_sensory' as const,       label: '② 運動・感覚',              defaultKasan: '' },
  { key: 'support_cognition_behavior' as const,     goalKey: 'support_goal_cognition_behavior' as const,     assigneeKey: 'support_assignee_cognition_behavior' as const,     priorityKey: 'support_priority_cognition_behavior' as const,     achievementKey: 'support_achievement_cognition_behavior' as const,     kasanKey: 'support_kasan_cognition_behavior' as const,     evaluationKey: 'support_evaluation_cognition_behavior' as const,     label: '③ 認知・行動',              defaultKasan: '' },
  { key: 'support_language_communication' as const, goalKey: 'support_goal_language_communication' as const, assigneeKey: 'support_assignee_language_communication' as const, priorityKey: 'support_priority_language_communication' as const, achievementKey: 'support_achievement_language_communication' as const, kasanKey: 'support_kasan_language_communication' as const, evaluationKey: 'support_evaluation_language_communication' as const, label: '④ 言語・コミュニケーション', defaultKasan: '' },
  { key: 'support_social_relationships' as const,   goalKey: 'support_goal_social_relationships' as const,   assigneeKey: 'support_assignee_social_relationships' as const,   priorityKey: 'support_priority_social_relationships' as const,   achievementKey: 'support_achievement_social_relationships' as const,   kasanKey: 'support_kasan_social_relationships' as const,   evaluationKey: 'support_evaluation_social_relationships' as const,   label: '⑤ 人間関係・社会性',        defaultKasan: '' },
  { key: 'support_transition' as const,             goalKey: 'support_goal_transition' as const,             assigneeKey: 'support_assignee_transition' as const,             priorityKey: 'support_priority_transition' as const,             achievementKey: 'support_achievement_transition' as const,             kasanKey: 'support_kasan_transition' as const,             evaluationKey: 'support_evaluation_transition' as const,             label: '⑥ 移行支援',               defaultKasan: '' },
  { key: 'support_family' as const,                 goalKey: 'support_goal_family' as const,                 assigneeKey: 'support_assignee_family' as const,                 priorityKey: 'support_priority_family' as const,                 achievementKey: 'support_achievement_family' as const,                 kasanKey: 'support_kasan_family' as const,                 evaluationKey: 'support_evaluation_family' as const,                 label: '⑦ 家族支援',               defaultKasan: '家族支援加算' },
] as const

const ACHIEVEMENT_OPTIONS = ['', ...Array.from({ length: 12 }, (_, i) => `${i + 1}ヶ月`)]

type AreaKey         = typeof AREAS[number]['key']
type AreaGoalKey     = typeof AREAS[number]['goalKey']
type AssigneeKey     = typeof AREAS[number]['assigneeKey']
type PriorityKey     = typeof AREAS[number]['priorityKey']
type AchievementKey  = typeof AREAS[number]['achievementKey']
type KasanKey        = typeof AREAS[number]['kasanKey']
type EvaluationKey   = typeof AREAS[number]['evaluationKey']
type AreaValues      = Record<AreaKey, string>
type GoalValues      = Record<AreaGoalKey, string>
type AssigneeValues  = Record<AssigneeKey, string>
type PriorityValues  = Record<PriorityKey, string>
type AchievementValues = Record<AchievementKey, string>
type KasanValues       = Record<KasanKey, string>
type EvaluationValues  = Record<EvaluationKey, string>

interface Props {
  plan: SupportPlan
  childId: string
  readOnly?: boolean
}

export function SupportPlanEditCard({ plan, childId, readOnly }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [planDate, setPlanDate] = useState(plan.plan_date)
  const [reviewDate, setReviewDate] = useState(plan.review_date ?? '')
  const [status, setStatus] = useState(plan.status)
  const [familyWishes, setFamilyWishes] = useState(plan.family_wishes ?? '')
  const [supportPolicy, setSupportPolicy] = useState(plan.support_policy ?? '')
  const [longTermGoals, setLongTermGoals] = useState(plan.long_term_goals ?? '')
  const [shortTermGoals, setShortTermGoals] = useState(plan.short_term_goals ?? '')
  const [longTermGoalRating, setLongTermGoalRating] = useState<number | null>(plan.long_term_goal_rating ?? null)
  const [shortTermGoalRating, setShortTermGoalRating] = useState<number | null>(plan.short_term_goal_rating ?? null)
  const [areaValues, setAreaValues] = useState<AreaValues>({
    support_health_life: plan.support_health_life ?? '',
    support_movement_sensory: plan.support_movement_sensory ?? '',
    support_cognition_behavior: plan.support_cognition_behavior ?? '',
    support_language_communication: plan.support_language_communication ?? '',
    support_social_relationships: plan.support_social_relationships ?? '',
    support_transition: plan.support_transition ?? '',
    support_family: plan.support_family ?? '',
  })
  const [assigneeValues, setAssigneeValues] = useState<AssigneeValues>({
    support_assignee_health_life: plan.support_assignee_health_life ?? '',
    support_assignee_movement_sensory: plan.support_assignee_movement_sensory ?? '',
    support_assignee_cognition_behavior: plan.support_assignee_cognition_behavior ?? '',
    support_assignee_language_communication: plan.support_assignee_language_communication ?? '',
    support_assignee_social_relationships: plan.support_assignee_social_relationships ?? '',
    support_assignee_transition: plan.support_assignee_transition ?? '',
    support_assignee_family: plan.support_assignee_family ?? '',
  })
  const [priorityValues, setPriorityValues] = useState<PriorityValues>({
    support_priority_health_life: plan.support_priority_health_life ?? '',
    support_priority_movement_sensory: plan.support_priority_movement_sensory ?? '',
    support_priority_cognition_behavior: plan.support_priority_cognition_behavior ?? '',
    support_priority_language_communication: plan.support_priority_language_communication ?? '',
    support_priority_social_relationships: plan.support_priority_social_relationships ?? '',
    support_priority_transition: plan.support_priority_transition ?? '',
    support_priority_family: plan.support_priority_family ?? '',
  })
  const [goalValues, setGoalValues] = useState<GoalValues>({
    support_goal_health_life: plan.support_goal_health_life ?? '',
    support_goal_movement_sensory: plan.support_goal_movement_sensory ?? '',
    support_goal_cognition_behavior: plan.support_goal_cognition_behavior ?? '',
    support_goal_language_communication: plan.support_goal_language_communication ?? '',
    support_goal_social_relationships: plan.support_goal_social_relationships ?? '',
    support_goal_transition: plan.support_goal_transition ?? '',
    support_goal_family: plan.support_goal_family ?? '',
  })
  const [managerName, setManagerName] = useState(plan.manager_name ?? '')
  const [standardServiceTime, setStandardServiceTime] = useState(plan.standard_service_time ?? '')
  const [autoFilling, setAutoFilling] = useState(false)
  const [specializedSupport, setSpecializedSupport] = useState(plan.support_specialized ?? '')
  const [generatingSpecialized, setGeneratingSpecialized] = useState(false)
  const [monitoringNotes, setMonitoringNotes] = useState(plan.monitoring_notes ?? '')

  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

  const autoFillServiceTime = async () => {
    setAutoFilling(true)
    try {
      type DaySetting = { day_of_week: number; pickup_time: string | null; dropoff_time: string | null }
      type UsagePlan = { pickup_time: string | null; dropoff_time: string | null; usage_plan_day_settings: DaySetting[] }
      const { data } = await supabase
        .from('usage_plans')
        .select('pickup_time, dropoff_time, usage_plan_day_settings(day_of_week, pickup_time, dropoff_time)')
        .eq('child_id', childId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
      const p = (data as unknown as UsagePlan[] | null)?.[0]
      if (!p) return
      const days = [...(p.usage_plan_day_settings ?? [])].sort((a, b) => a.day_of_week - b.day_of_week)
      const dayLabel = days.length > 0
        ? `${days.map((d) => DAY_NAMES[d.day_of_week]).join('・')}（週${days.length}回）`
        : ''
      const pickupT  = days[0]?.pickup_time  ?? p.pickup_time
      const dropoffT = days[0]?.dropoff_time ?? p.dropoff_time
      const timeLabel = pickupT && dropoffT
        ? ` ${pickupT.slice(0, 5)}〜${dropoffT.slice(0, 5)}`
        : ''
      const result = (dayLabel + timeLabel).trim()
      if (result) setStandardServiceTime(result)
    } finally {
      setAutoFilling(false)
    }
  }
  const [saving, setSaving] = useState(false)
  const [refining, setRefining] = useState<string | null>(null)
  const [generatingGoal, setGeneratingGoal] = useState<string | null>(null)

  const [achievementValues, setAchievementValues] = useState<AchievementValues>({
    support_achievement_health_life: plan.support_achievement_health_life ?? '',
    support_achievement_movement_sensory: plan.support_achievement_movement_sensory ?? '',
    support_achievement_cognition_behavior: plan.support_achievement_cognition_behavior ?? '',
    support_achievement_language_communication: plan.support_achievement_language_communication ?? '',
    support_achievement_social_relationships: plan.support_achievement_social_relationships ?? '',
    support_achievement_transition: plan.support_achievement_transition ?? '',
    support_achievement_family: plan.support_achievement_family ?? '',
  })
  const [kasanValues, setKasanValues] = useState<KasanValues>({
    support_kasan_health_life: plan.support_kasan_health_life ?? '',
    support_kasan_movement_sensory: plan.support_kasan_movement_sensory ?? '',
    support_kasan_cognition_behavior: plan.support_kasan_cognition_behavior ?? '',
    support_kasan_language_communication: plan.support_kasan_language_communication ?? '',
    support_kasan_social_relationships: plan.support_kasan_social_relationships ?? '',
    support_kasan_transition: plan.support_kasan_transition ?? '',
    support_kasan_family: plan.support_kasan_family ?? '',
  })

  const [evaluationValues, setEvaluationValues] = useState<EvaluationValues>({
    support_evaluation_health_life: plan.support_evaluation_health_life ?? '',
    support_evaluation_movement_sensory: plan.support_evaluation_movement_sensory ?? '',
    support_evaluation_cognition_behavior: plan.support_evaluation_cognition_behavior ?? '',
    support_evaluation_language_communication: plan.support_evaluation_language_communication ?? '',
    support_evaluation_social_relationships: plan.support_evaluation_social_relationships ?? '',
    support_evaluation_transition: plan.support_evaluation_transition ?? '',
    support_evaluation_family: plan.support_evaluation_family ?? '',
  })

  const setGoal        = (key: AreaGoalKey,    value: string) => setGoalValues((p)        => ({ ...p, [key]: value }))
  const setAssignee    = (key: AssigneeKey,     value: string) => setAssigneeValues((p)    => ({ ...p, [key]: value }))
  const setPriority    = (key: PriorityKey,     value: string) => setPriorityValues((p)    => ({ ...p, [key]: value }))
  const setAchievement = (key: AchievementKey,  value: string) => setAchievementValues((p) => ({ ...p, [key]: value }))
  const setKasan       = (key: KasanKey,        value: string) => setKasanValues((p)       => ({ ...p, [key]: value }))
  const setEvaluation  = (key: EvaluationKey,  value: string) => setEvaluationValues((p)  => ({ ...p, [key]: value }))

  const generateGoal = async (area: typeof AREAS[number]) => {
    const content = areaValues[area.key]
    if (!content.trim()) return
    setGeneratingGoal(area.goalKey)
    try {
      const res = await fetch('/api/support-plans/generate-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaLabel: area.label, supportContent: content }),
      })
      const json = await res.json()
      if (json.goal) setGoal(area.goalKey, json.goal)
    } finally {
      setGeneratingGoal(null)
    }
  }

  const generateSpecialized = async () => {
    setGeneratingSpecialized(true)
    try {
      const res = await fetch('/api/support-plans/generate-specialized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childName: '',
          diagnosis: null,
          supportPolicy,
          longTermGoals,
        }),
      })
      const json = await res.json()
      if (json.content) setSpecializedSupport(json.content)
    } finally {
      setGeneratingSpecialized(false)
    }
  }

  const setArea = (key: AreaKey, value: string) =>
    setAreaValues((prev) => ({ ...prev, [key]: value }))

  const refineField = async (fieldType: string, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return
    setRefining(fieldType)
    try {
      const res = await fetch('/api/support-plans/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType, content: value }),
      })
      const json = await res.json()
      if (json.refined) setter(json.refined)
    } finally {
      setRefining(null)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('support_plans').update({
      plan_date: planDate,
      review_date: reviewDate || null,
      status,
      family_wishes: familyWishes || null,
      support_policy: supportPolicy || null,
      long_term_goals: longTermGoals || null,
      short_term_goals: shortTermGoals || null,
      support_health_life: areaValues.support_health_life || null,
      support_movement_sensory: areaValues.support_movement_sensory || null,
      support_cognition_behavior: areaValues.support_cognition_behavior || null,
      support_language_communication: areaValues.support_language_communication || null,
      support_social_relationships: areaValues.support_social_relationships || null,
      support_transition: areaValues.support_transition || null,
      support_family: areaValues.support_family || null,
      support_goal_health_life: goalValues.support_goal_health_life || null,
      support_goal_movement_sensory: goalValues.support_goal_movement_sensory || null,
      support_goal_cognition_behavior: goalValues.support_goal_cognition_behavior || null,
      support_goal_language_communication: goalValues.support_goal_language_communication || null,
      support_goal_social_relationships: goalValues.support_goal_social_relationships || null,
      support_goal_transition: goalValues.support_goal_transition || null,
      support_goal_family: goalValues.support_goal_family || null,
      support_assignee_health_life: assigneeValues.support_assignee_health_life || null,
      support_assignee_movement_sensory: assigneeValues.support_assignee_movement_sensory || null,
      support_assignee_cognition_behavior: assigneeValues.support_assignee_cognition_behavior || null,
      support_assignee_language_communication: assigneeValues.support_assignee_language_communication || null,
      support_assignee_social_relationships: assigneeValues.support_assignee_social_relationships || null,
      support_assignee_transition: assigneeValues.support_assignee_transition || null,
      support_assignee_family: assigneeValues.support_assignee_family || null,
      support_priority_health_life: priorityValues.support_priority_health_life || null,
      support_priority_movement_sensory: priorityValues.support_priority_movement_sensory || null,
      support_priority_cognition_behavior: priorityValues.support_priority_cognition_behavior || null,
      support_priority_language_communication: priorityValues.support_priority_language_communication || null,
      support_priority_social_relationships: priorityValues.support_priority_social_relationships || null,
      support_priority_transition: priorityValues.support_priority_transition || null,
      support_priority_family: priorityValues.support_priority_family || null,
      support_achievement_health_life: achievementValues.support_achievement_health_life || null,
      support_achievement_movement_sensory: achievementValues.support_achievement_movement_sensory || null,
      support_achievement_cognition_behavior: achievementValues.support_achievement_cognition_behavior || null,
      support_achievement_language_communication: achievementValues.support_achievement_language_communication || null,
      support_achievement_social_relationships: achievementValues.support_achievement_social_relationships || null,
      support_achievement_transition: achievementValues.support_achievement_transition || null,
      support_achievement_family: achievementValues.support_achievement_family || null,
      support_kasan_health_life: kasanValues.support_kasan_health_life || null,
      support_kasan_movement_sensory: kasanValues.support_kasan_movement_sensory || null,
      support_kasan_cognition_behavior: kasanValues.support_kasan_cognition_behavior || null,
      support_kasan_language_communication: kasanValues.support_kasan_language_communication || null,
      support_kasan_social_relationships: kasanValues.support_kasan_social_relationships || null,
      support_kasan_transition: kasanValues.support_kasan_transition || null,
      support_kasan_family: kasanValues.support_kasan_family || null,
      support_evaluation_health_life: evaluationValues.support_evaluation_health_life || null,
      support_evaluation_movement_sensory: evaluationValues.support_evaluation_movement_sensory || null,
      support_evaluation_cognition_behavior: evaluationValues.support_evaluation_cognition_behavior || null,
      support_evaluation_language_communication: evaluationValues.support_evaluation_language_communication || null,
      support_evaluation_social_relationships: evaluationValues.support_evaluation_social_relationships || null,
      support_evaluation_transition: evaluationValues.support_evaluation_transition || null,
      support_evaluation_family: evaluationValues.support_evaluation_family || null,
      support_specialized: specializedSupport || null,
      manager_name: managerName || null,
      standard_service_time: standardServiceTime || null,
      monitoring_notes: monitoringNotes || null,
      long_term_goal_rating: longTermGoalRating || null,
      short_term_goal_rating: shortTermGoalRating || null,
    }).eq('id', plan.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const hasAreaContent = AREAS.some((a) => plan[a.key])

  const RefineButton = ({ fieldType, disabled }: { fieldType: string; disabled: boolean }) => (
    <button
      type="button"
      onClick={() => {
        if (fieldType === 'family_wishes') refineField('family_wishes', familyWishes, setFamilyWishes)
        else if (fieldType === 'support_policy') refineField('support_policy', supportPolicy, setSupportPolicy)
      }}
      disabled={disabled}
      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Wand2 className="h-3 w-3" />
      {refining === fieldType ? '整えています...' : '文章を整える'}
    </button>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{formatDate(plan.plan_date)} 作成</CardTitle>
          <div className="flex items-center gap-2">
            {plan.review_date && (
              <span className="text-xs text-gray-500">見直し予定: {formatDate(plan.review_date)}</span>
            )}
            <Badge variant={statusVariant[plan.status] ?? 'secondary'}>
              {statusLabel[plan.status] ?? plan.status}
            </Badge>
            {!readOnly && (
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-2 py-1"
              >
                {editing ? <ChevronUp className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {editing ? '閉じる' : '編集'}
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {!editing ? (
          // 表示モード
          <>
            {plan.family_wishes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">家族の意向</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.family_wishes}</p>
              </div>
            )}
            {plan.support_policy && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">支援の方針</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.support_policy}</p>
              </div>
            )}
            {plan.long_term_goals && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">長期目標</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.long_term_goals}</p>
                {plan.long_term_goal_rating != null && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">達成度:</span>
                    <StarRating value={plan.long_term_goal_rating} readOnly />
                  </div>
                )}
              </div>
            )}
            {plan.short_term_goals && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">短期目標</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.short_term_goals}</p>
                {plan.short_term_goal_rating != null && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">達成度:</span>
                    <StarRating value={plan.short_term_goal_rating} readOnly />
                  </div>
                )}
              </div>
            )}
            {/* 7領域の支援目標・支援内容 */}
            {hasAreaContent && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">支援内容・方法（7領域）</p>
                <div className="space-y-2">
                  {AREAS.map((area) => (plan[area.key] || plan[area.goalKey]) && (
                    <div key={area.key} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-gray-600 mb-0.5">{area.label}</p>
                      {plan[area.goalKey] && (
                        <div className="mb-1">
                          <span className="text-xs text-indigo-600 font-medium">支援目標：</span>
                          <span className="text-gray-700 whitespace-pre-wrap text-sm">{plan[area.goalKey]}</span>
                        </div>
                      )}
                      {plan[area.key] && (
                        <p className="text-gray-700 whitespace-pre-wrap text-sm">{plan[area.key]}</p>
                      )}
                      {(plan[area.assigneeKey] || plan[area.priorityKey]) && (
                        <div className="flex gap-3 mt-1">
                          {plan[area.assigneeKey] && <span className="text-xs text-gray-500">担当: {plan[area.assigneeKey]}</span>}
                          {plan[area.priorityKey] && <span className="text-xs text-gray-500">優先順位: {plan[area.priorityKey]}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 旧 support_content の互換表示 */}
            {!hasAreaContent && plan.support_content && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">支援内容</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.support_content}</p>
              </div>
            )}
            {plan.support_specialized && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">専門的支援</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.support_specialized}</p>
              </div>
            )}
            {plan.standard_service_time && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">支援の標準的な提供時間等</p>
                <p className="text-gray-700">{plan.standard_service_time}</p>
              </div>
            )}
            {plan.manager_name && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">児童発達支援管理責任者</p>
                <p className="text-gray-700">{plan.manager_name}</p>
              </div>
            )}
            {plan.monitoring_notes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">モニタリング</p>
                <p className="text-gray-700 whitespace-pre-wrap">{plan.monitoring_notes}</p>
              </div>
            )}
          </>
        ) : (
          // 編集モード
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">計画作成日</label>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">見直し予定日</label>
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="draft">下書き</option>
                <option value="active">有効</option>
                <option value="reviewed">見直し済</option>
                <option value="archived">保存</option>
              </select>
            </div>

            {/* 家族の意向 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">家族の意向</label>
                <RefineButton fieldType="family_wishes" disabled={refining === 'family_wishes' || !familyWishes.trim()} />
              </div>
              <textarea
                value={familyWishes}
                onChange={(e) => setFamilyWishes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* 支援の方針 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">支援の方針</label>
                <RefineButton fieldType="support_policy" disabled={refining === 'support_policy' || !supportPolicy.trim()} />
              </div>
              <textarea
                value={supportPolicy}
                onChange={(e) => setSupportPolicy(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* 長期目標 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">長期目標</label>
                <button
                  type="button"
                  onClick={() => refineField('long_term_goals', longTermGoals, setLongTermGoals)}
                  disabled={refining === 'long_term_goals' || !longTermGoals.trim()}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-3 w-3" />
                  {refining === 'long_term_goals' ? '整えています...' : '文章を整える'}
                </button>
              </div>
              <textarea
                value={longTermGoals}
                onChange={(e) => setLongTermGoals(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">達成度評価:</span>
                <StarRating value={longTermGoalRating} onChange={(v) => setLongTermGoalRating(v || null)} />
              </div>
            </div>

            {/* 短期目標 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">短期目標</label>
                <button
                  type="button"
                  onClick={() => refineField('short_term_goals', shortTermGoals, setShortTermGoals)}
                  disabled={refining === 'short_term_goals' || !shortTermGoals.trim()}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-3 w-3" />
                  {refining === 'short_term_goals' ? '整えています...' : '文章を整える'}
                </button>
              </div>
              <textarea
                value={shortTermGoals}
                onChange={(e) => setShortTermGoals(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">達成度評価:</span>
                <StarRating value={shortTermGoalRating} onChange={(v) => setShortTermGoalRating(v || null)} />
              </div>
            </div>

            {/* 支援の標準的な提供時間等 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">支援の標準的な提供時間等（曜日・頻度・時間）</label>
                <button
                  type="button"
                  onClick={() => void autoFillServiceTime()}
                  disabled={autoFilling}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  <RefreshCw className={`h-3 w-3 ${autoFilling ? 'animate-spin' : ''}`} />
                  {autoFilling ? '取得中...' : '利用計画から自動入力'}
                </button>
              </div>
              <input
                type="text"
                value={standardServiceTime}
                onChange={(e) => setStandardServiceTime(e.target.value)}
                placeholder="例: 月・水・金（週3回）14:00〜16:30"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* 支援内容・支援目標（7領域） */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-600 border-b border-gray-100 pb-1">支援内容・支援目標（7領域）</p>
              {AREAS.map((area) => (
                <div key={area.key} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">{area.label}</p>

                  {/* 支援内容 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">支援内容</label>
                      <button
                        type="button"
                        onClick={() => refineField(area.key, areaValues[area.key], (v) => setArea(area.key, v))}
                        disabled={refining === area.key || !areaValues[area.key].trim()}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Wand2 className="h-3 w-3" />
                        {refining === area.key ? '整えています...' : '文章を整える'}
                      </button>
                    </div>
                    <textarea
                      value={areaValues[area.key]}
                      onChange={(e) => setArea(area.key, e.target.value)}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none bg-white"
                    />
                  </div>

                  {/* 評価（2枚目のシート用） */}
                  <div>
                    <label className="text-xs font-medium text-orange-700 mb-1 block">評価（2枚目シート）</label>
                    <textarea
                      value={evaluationValues[area.evaluationKey]}
                      onChange={(e) => setEvaluation(area.evaluationKey, e.target.value)}
                      rows={2}
                      placeholder="目標達成の評価・振り返りを記入"
                      className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none bg-orange-50/30"
                    />
                  </div>

                  {/* 達成時期・加算・担当者・優先順位 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">達成時期</label>
                      <select
                        value={achievementValues[area.achievementKey]}
                        onChange={(e) => setAchievement(area.achievementKey, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      >
                        {ACHIEVEMENT_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o || '未設定'}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">加算</label>
                      <input
                        type="text"
                        value={kasanValues[area.kasanKey]}
                        onChange={(e) => setKasan(area.kasanKey, e.target.value)}
                        placeholder={area.defaultKasan || '加算名を入力'}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">担当者</label>
                      <input
                        type="text"
                        value={assigneeValues[area.assigneeKey]}
                        onChange={(e) => setAssignee(area.assigneeKey, e.target.value)}
                        placeholder="担当者名"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">優先順位</label>
                      <input
                        type="text"
                        value={priorityValues[area.priorityKey]}
                        onChange={(e) => setPriority(area.priorityKey, e.target.value)}
                        placeholder="例: 1"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* 支援目標 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-indigo-700">支援目標（到達目標）</label>
                      <button
                        type="button"
                        onClick={() => void generateGoal(area)}
                        disabled={generatingGoal === area.goalKey || !areaValues[area.key].trim()}
                        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                      >
                        <Wand2 className="h-3 w-3" />
                        {generatingGoal === area.goalKey ? 'AI生成中...' : 'AI で生成'}
                      </button>
                    </div>
                    <textarea
                      value={goalValues[area.goalKey]}
                      onChange={(e) => setGoal(area.goalKey, e.target.value)}
                      rows={2}
                      placeholder="支援内容を入力後、「AI で生成」で自動作成できます"
                      className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none bg-indigo-50/40"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 専門的支援 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">専門的支援</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void generateSpecialized()}
                    disabled={generatingSpecialized}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    <Wand2 className="h-3 w-3" />
                    {generatingSpecialized ? 'AI生成中...' : 'AI で生成'}
                  </button>
                  <button
                    type="button"
                    onClick={() => refineField('support_specialized', specializedSupport, setSpecializedSupport)}
                    disabled={refining === 'support_specialized' || !specializedSupport.trim()}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="h-3 w-3" />
                    {refining === 'support_specialized' ? '整えています...' : '文章を整える'}
                  </button>
                </div>
              </div>
              <textarea
                value={specializedSupport}
                onChange={(e) => setSpecializedSupport(e.target.value)}
                rows={3}
                placeholder="例：OT（作業療法士）による感覚統合訓練を月2回実施し、手先の巧緻性向上と感覚過敏への対応を行う"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* 児童発達支援管理責任者 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">児童発達支援管理責任者氏名</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="氏名を入力"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* モニタリング記録 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">モニタリング記録</label>
                <button
                  type="button"
                  onClick={() => refineField('monitoring_notes', monitoringNotes, setMonitoringNotes)}
                  disabled={refining === 'monitoring_notes' || !monitoringNotes.trim()}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-3 w-3" />
                  {refining === 'monitoring_notes' ? '整えています...' : '文章を整える'}
                </button>
              </div>
              <textarea
                value={monitoringNotes}
                onChange={(e) => setMonitoringNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                キャンセル
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
