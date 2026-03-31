'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown, ChevronUp, Wand2 } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'ongoing', label: '継続中', color: 'text-blue-700' },
  { value: 'achieved', label: '目標達成', color: 'text-green-700' },
  { value: 'revised', label: '計画見直し', color: 'text-amber-700' },
  { value: 'needs_review', label: '要検討', color: 'text-red-700' },
] as const

interface Props {
  supportPlanId: string
  childId: string
  readOnly?: boolean
}

export function MonitoringRecordForm({ supportPlanId, childId, readOnly }: Props) {
  if (readOnly) return null
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

          {(
            [
              { key: 'long_term_progress', label: '長期目標の達成状況', value: longTermProgress, setter: setLongTermProgress, placeholder: '長期目標に対する現在の進捗・変化' },
              { key: 'short_term_progress', label: '短期目標の達成状況', value: shortTermProgress, setter: setShortTermProgress, placeholder: '短期目標に対する現在の進捗・変化' },
              { key: 'issues', label: '課題・気になること', value: issues, setter: setIssues, placeholder: '現在の課題や懸念事項' },
              { key: 'next_actions', label: '今後の対応・方針', value: nextActions, setter: setNextActions, placeholder: '次期計画への反映事項、支援の見直し点など' },
            ] as const
          ).map(({ key, label, value, setter, placeholder }) => (
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
                rows={2}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}

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
