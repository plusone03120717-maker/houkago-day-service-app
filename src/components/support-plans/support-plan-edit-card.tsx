'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Wand2, ChevronUp } from 'lucide-react'
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
  { key: 'support_health_life' as const, label: '① 健康・生活' },
  { key: 'support_movement_sensory' as const, label: '② 運動・感覚' },
  { key: 'support_cognition_behavior' as const, label: '③ 認知・行動' },
  { key: 'support_language_communication' as const, label: '④ 言語・コミュニケーション' },
  { key: 'support_social_relationships' as const, label: '⑤ 人間関係・社会性' },
  { key: 'support_transition' as const, label: '⑥ 移行支援' },
  { key: 'support_family' as const, label: '⑦ 家族支援' },
] as const

type AreaKey = typeof AREAS[number]['key']
type AreaValues = Record<AreaKey, string>

interface Props {
  plan: SupportPlan
  readOnly?: boolean
}

export function SupportPlanEditCard({ plan, readOnly }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [planDate, setPlanDate] = useState(plan.plan_date)
  const [reviewDate, setReviewDate] = useState(plan.review_date ?? '')
  const [status, setStatus] = useState(plan.status)
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
  const [monitoringNotes, setMonitoringNotes] = useState(plan.monitoring_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [refining, setRefining] = useState<string | null>(null)

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
      long_term_goals: longTermGoals || null,
      short_term_goals: shortTermGoals || null,
      support_health_life: areaValues.support_health_life || null,
      support_movement_sensory: areaValues.support_movement_sensory || null,
      support_cognition_behavior: areaValues.support_cognition_behavior || null,
      support_language_communication: areaValues.support_language_communication || null,
      support_social_relationships: areaValues.support_social_relationships || null,
      support_transition: areaValues.support_transition || null,
      support_family: areaValues.support_family || null,
      monitoring_notes: monitoringNotes || null,
      long_term_goal_rating: longTermGoalRating || null,
      short_term_goal_rating: shortTermGoalRating || null,
    }).eq('id', plan.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const hasAreaContent = AREAS.some((a) => plan[a.key])

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
            {/* 7領域の支援内容 */}
            {hasAreaContent && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">支援内容・方法（7領域）</p>
                <div className="space-y-2">
                  {AREAS.map((area) => plan[area.key] && (
                    <div key={area.key} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-gray-600 mb-0.5">{area.label}</p>
                      <p className="text-gray-700 whitespace-pre-wrap text-sm">{plan[area.key]}</p>
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

            {/* 支援内容（7領域） */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-600 border-b border-gray-100 pb-1">支援内容・方法（7領域）</p>
              {AREAS.map((area) => (
                <div key={area.key} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">{area.label}</label>
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
              ))}
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
