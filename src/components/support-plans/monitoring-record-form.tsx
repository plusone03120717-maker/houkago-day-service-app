import { getTodayJST } from '@/lib/utils'
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown, ChevronUp, Wand2, Bot, Trash2 } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'ongoing', label: '継続中', color: 'text-blue-700' },
  { value: 'achieved', label: '目標達成', color: 'text-green-700' },
  { value: 'revised', label: '計画見直し', color: 'text-amber-700' },
  { value: 'needs_review', label: '要検討', color: 'text-red-700' },
] as const

type AgencyNote = { name: string; content: string }

type AiResult = {
  long_term_progress?: string
  short_term_progress?: string
  issues?: string
  next_actions?: string
  specialized_support?: string
  overall_status?: string
  period?: { endDate: string }
}

interface Props {
  supportPlanId: string | null
  childId: string
  readOnly?: boolean
}

export function MonitoringRecordForm({ supportPlanId, childId, readOnly }: Props) {
  if (readOnly) return null
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [recordDate, setRecordDate] = useState(getTodayJST())
  const [longTermProgress, setLongTermProgress] = useState('')
  const [shortTermProgress, setShortTermProgress] = useState('')
  const [issues, setIssues] = useState('')
  const [nextActions, setNextActions] = useState('')
  const [overallStatus, setOverallStatus] = useState<'ongoing' | 'achieved' | 'revised' | 'needs_review'>('ongoing')
  const [familyWishes, setFamilyWishes] = useState('')
  const [specializedSupport, setSpecializedSupport] = useState('')
  const [agencyNotes, setAgencyNotes] = useState<AgencyNote[]>([])
  const [saving, setSaving] = useState(false)
  const [refining, setRefining] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)

  const fetchAiResult = async (): Promise<AiResult | null> => {
    if (!supportPlanId) return null
    const res = await fetch('/api/monitoring/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supportPlanId, childId }),
    })
    if (!res.ok) return null
    return res.json()
  }

  const handleAiGenerateField = async (
    fieldKey: string,
    resultKey: keyof AiResult,
    setter: (v: string) => void,
  ) => {
    setGenerating(fieldKey)
    try {
      const json = await fetchAiResult()
      if (!json) return
      const value = json[resultKey]
      if (value && typeof value === 'string') setter(value)
    } finally {
      setGenerating(null)
    }
  }

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

  const addAgencyNote = () => setAgencyNotes((prev) => [...prev, { name: '', content: '' }])
  const updateAgencyNote = (i: number, field: keyof AgencyNote, value: string) => {
    setAgencyNotes((prev) => prev.map((n, idx) => idx === i ? { ...n, [field]: value } : n))
  }
  const removeAgencyNote = (i: number) => setAgencyNotes((prev) => prev.filter((_, idx) => idx !== i))

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
      specialized_support: specializedSupport || null,
      overall_status: overallStatus,
      family_wishes: familyWishes || null,
      agency_notes: agencyNotes.filter((n) => n.name.trim() || n.content.trim()),
    })
    setSaving(false)
    setOpen(false)
    setLongTermProgress('')
    setShortTermProgress('')
    setIssues('')
    setNextActions('')
    setSpecializedSupport('')
    setOverallStatus('ongoing')
    setFamilyWishes('')
    setAgencyNotes([])
    startTransition(() => router.refresh())
  }

  const fields = [
    { key: 'long_term_progress', resultKey: 'long_term_progress' as keyof AiResult, label: '長期目標の達成状況', value: longTermProgress, setter: setLongTermProgress, placeholder: '長期目標に対する現在の進捗・変化' },
    { key: 'short_term_progress', resultKey: 'short_term_progress' as keyof AiResult, label: '短期目標の達成状況', value: shortTermProgress, setter: setShortTermProgress, placeholder: '短期目標に対する現在の進捗・変化' },
    { key: 'issues', resultKey: 'issues' as keyof AiResult, label: '課題・気になること', value: issues, setter: setIssues, placeholder: '現在の課題や懸念事項' },
    { key: 'next_actions', resultKey: 'next_actions' as keyof AiResult, label: '今後の対応・方針', value: nextActions, setter: setNextActions, placeholder: '次期計画への反映事項、支援の見直し点など' },
    { key: 'specialized_support', resultKey: 'specialized_support' as keyof AiResult, label: '専門的支援', value: specializedSupport, setter: setSpecializedSupport, placeholder: '専門的支援として実施した内容・手法・工夫点' },
  ] as const

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

          {fields.map(({ key, resultKey, label, value, setter, placeholder }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">{label}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAiGenerateField(key, resultKey, setter as (v: string) => void)}
                    disabled={generating === key || !supportPlanId}
                    title={!supportPlanId ? '支援計画がない場合はAI生成を利用できません' : undefined}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Bot className="h-3 w-3" />
                    {generating === key ? 'AI生成中...' : 'AI生成'}
                  </button>
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

          {/* 家族の要望 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">家族の要望</label>
              <button
                type="button"
                onClick={() => refineField('family_wishes', familyWishes, setFamilyWishes)}
                disabled={refining === 'family_wishes' || !familyWishes.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3 w-3" />
                {refining === 'family_wishes' ? '整えています...' : '文章を整える'}
              </button>
            </div>
            <textarea
              value={familyWishes}
              onChange={(e) => setFamilyWishes(e.target.value)}
              rows={2}
              placeholder="保護者・家族からの要望や意見"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* 事業所ごとのメモ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">関係事業所の記録</label>
              <button
                type="button"
                onClick={addAgencyNote}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="h-3 w-3" />
                事業所を追加
              </button>
            </div>
            {agencyNotes.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">「事業所を追加」で記録できます</p>
            )}
            <div className="space-y-2">
              {agencyNotes.map((note, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-2 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={note.name}
                      onChange={(e) => updateAgencyNote(i, 'name', e.target.value)}
                      placeholder="事業所名（例：○○小学校、△△クリニック）"
                      className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeAgencyNote(i)}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={note.content}
                    onChange={(e) => updateAgencyNote(i, 'content', e.target.value)}
                    rows={2}
                    placeholder="この事業所との連携内容・情報共有事項"
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none bg-white"
                  />
                </div>
              ))}
            </div>
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
