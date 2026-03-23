'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Wand2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type SupportPlan = {
  id: string
  plan_date: string
  review_date: string | null
  status: string
  long_term_goals: string | null
  short_term_goals: string | null
  support_content: string | null
  monitoring_notes: string | null
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

interface Props {
  plan: SupportPlan
}

export function SupportPlanEditCard({ plan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [planDate, setPlanDate] = useState(plan.plan_date)
  const [reviewDate, setReviewDate] = useState(plan.review_date ?? '')
  const [status, setStatus] = useState(plan.status)
  const [longTermGoals, setLongTermGoals] = useState(plan.long_term_goals ?? '')
  const [shortTermGoals, setShortTermGoals] = useState(plan.short_term_goals ?? '')
  const [supportContent, setSupportContent] = useState(plan.support_content ?? '')
  const [monitoringNotes, setMonitoringNotes] = useState(plan.monitoring_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [refining, setRefining] = useState<string | null>(null)

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
      support_content: supportContent || null,
      monitoring_notes: monitoringNotes || null,
    }).eq('id', plan.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const fields = [
    { key: 'long_term_goals', label: '長期目標', value: longTermGoals, setter: setLongTermGoals, rows: 3 },
    { key: 'short_term_goals', label: '短期目標', value: shortTermGoals, setter: setShortTermGoals, rows: 3 },
    { key: 'support_content', label: '支援内容・方法', value: supportContent, setter: setSupportContent, rows: 4 },
    { key: 'monitoring_notes', label: 'モニタリング記録', value: monitoringNotes, setter: setMonitoringNotes, rows: 3 },
  ] as const

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
            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-2 py-1"
            >
              {editing ? <ChevronUp className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editing ? '閉じる' : '編集'}
            </button>
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

            {fields.map(({ key, label, value, setter, rows }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">{label}</label>
                  <button
                    type="button"
                    onClick={() => refineField(key, value, setter as (v: string) => void)}
                    disabled={refining === key || !value.trim()}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="h-3 w-3" />
                    {refining === key ? '整えています...' : '文章を整える'}
                  </button>
                </div>
                <textarea
                  value={value}
                  onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  rows={rows}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            ))}

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
