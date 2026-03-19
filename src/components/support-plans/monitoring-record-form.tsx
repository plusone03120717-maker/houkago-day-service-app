'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'ongoing', label: '継続中', color: 'text-blue-700' },
  { value: 'achieved', label: '目標達成', color: 'text-green-700' },
  { value: 'revised', label: '計画見直し', color: 'text-amber-700' },
  { value: 'needs_review', label: '要検討', color: 'text-red-700' },
] as const

interface Props {
  supportPlanId: string
  childId: string
}

export function MonitoringRecordForm({ supportPlanId, childId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10))
  const [longTermProgress, setLongTermProgress] = useState('')
  const [shortTermProgress, setShortTermProgress] = useState('')
  const [issues, setIssues] = useState('')
  const [nextActions, setNextActions] = useState('')
  const [overallStatus, setOverallStatus] = useState<'ongoing' | 'achieved' | 'revised' | 'needs_review'>('ongoing')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!recordDate) return
    setSaving(true)
    await supabase.from('monitoring_records').insert({
      support_plan_id: supportPlanId,
      child_id: childId,
      record_date: recordDate,
      long_term_progress: longTermProgress || null,
      short_term_progress: shortTermProgress || null,
      issues: issues || null,
      next_actions: nextActions || null,
      overall_status: overallStatus,
    })
    setSaving(false)
    setOpen(false)
    setLongTermProgress('')
    setShortTermProgress('')
    setIssues('')
    setNextActions('')
    setOverallStatus('ongoing')
    startTransition(() => router.refresh())
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-3 text-left hover:bg-gray-50 rounded-lg"
      >
        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-600" />
          モニタリング記録を追加
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-3 pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">記録日</label>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">総合判定</label>
              <select
                value={overallStatus}
                onChange={(e) => setOverallStatus(e.target.value as typeof overallStatus)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">長期目標の達成状況</label>
            <textarea
              value={longTermProgress}
              onChange={(e) => setLongTermProgress(e.target.value)}
              rows={2}
              placeholder="長期目標に対する現在の進捗・変化"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">短期目標の達成状況</label>
            <textarea
              value={shortTermProgress}
              onChange={(e) => setShortTermProgress(e.target.value)}
              rows={2}
              placeholder="短期目標に対する現在の進捗・変化"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">課題・気になること</label>
            <textarea
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              rows={2}
              placeholder="現在の課題や懸念事項"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">今後の対応・方針</label>
            <textarea
              value={nextActions}
              onChange={(e) => setNextActions(e.target.value)}
              rows={2}
              placeholder="次期計画への反映事項、支援の見直し点など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || !recordDate} size="sm">
              {saving ? '保存中...' : '記録を保存'}
            </Button>
            <Button onClick={() => setOpen(false)} variant="outline" size="sm">
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
