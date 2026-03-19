'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Plus, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  childId: string
  childName: string
  diagnosis: string | null
  recentRecords: Array<{
    date: string
    activities: unknown[]
    notable_events: string | null
    contact_note: string | null
  }>
}

export function SupportPlanForm({ childId, childName, diagnosis, recentRecords }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10))
  const [reviewDate, setReviewDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 6)
    return d.toISOString().slice(0, 10)
  })
  const [longTermGoals, setLongTermGoals] = useState('')
  const [shortTermGoals, setShortTermGoals] = useState('')
  const [supportContent, setSupportContent] = useState('')
  const [monitoringNotes, setMonitoringNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleGenerateAI = async () => {
    setGenerating(true)
    const res = await fetch('/api/support-plans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childName,
        diagnosis,
        recentRecords: recentRecords.slice(0, 5),
        existing: { longTermGoals, shortTermGoals },
      }),
    })
    if (res.ok) {
      const json = await res.json()
      if (json.longTermGoals) setLongTermGoals(json.longTermGoals)
      if (json.shortTermGoals) setShortTermGoals(json.shortTermGoals)
      if (json.supportContent) setSupportContent(json.supportContent)
    }
    setGenerating(false)
  }

  const handleSave = async (status: 'draft' | 'active') => {
    setSaving(true)
    await supabase.from('support_plans').insert({
      child_id: childId,
      plan_date: planDate,
      review_date: reviewDate || null,
      status,
      long_term_goals: longTermGoals || null,
      short_term_goals: shortTermGoals || null,
      support_content: supportContent || null,
      monitoring_notes: monitoringNotes || null,
    })
    setSaving(false)
    setOpen(false)
    setLongTermGoals('')
    setShortTermGoals('')
    setSupportContent('')
    setMonitoringNotes('')
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-600" />
            新しい支援計画を作成
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
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

          {/* AI下書き生成 */}
          <Button
            onClick={handleGenerateAI}
            disabled={generating}
            variant="outline"
            size="sm"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'AI生成中...' : 'AIで下書きを生成'}
          </Button>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">長期目標（6ヶ月〜1年）</label>
            <textarea
              value={longTermGoals}
              onChange={(e) => setLongTermGoals(e.target.value)}
              rows={3}
              placeholder="例：自分の気持ちを言葉で伝えられるようになる"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">短期目標（3〜6ヶ月）</label>
            <textarea
              value={shortTermGoals}
              onChange={(e) => setShortTermGoals(e.target.value)}
              rows={3}
              placeholder="例：スタッフに要求を伝えるサインを使える"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">支援内容・方法</label>
            <textarea
              value={supportContent}
              onChange={(e) => setSupportContent(e.target.value)}
              rows={4}
              placeholder="具体的な支援方法、活動内容、配慮事項など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">モニタリング記録</label>
            <textarea
              value={monitoringNotes}
              onChange={(e) => setMonitoringNotes(e.target.value)}
              rows={3}
              placeholder="目標の達成状況・今後の課題など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleSave('draft')}
              disabled={saving}
              variant="outline"
              size="sm"
            >
              下書き保存
            </Button>
            <Button
              onClick={() => handleSave('active')}
              disabled={saving}
              size="sm"
            >
              {saving ? '保存中...' : '計画を確定'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
