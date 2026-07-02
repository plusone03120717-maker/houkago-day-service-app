'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Wand2, ChevronUp, Bot, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type AgencyNote = { name: string; content: string }

type MonitoringRecord = {
  id: string
  record_date: string
  long_term_progress: string | null
  short_term_progress: string | null
  issues: string | null
  next_actions: string | null
  specialized_support: string | null
  overall_status: string
  family_wishes: string | null
  agency_notes: AgencyNote[]
}

type AiResult = {
  long_term_progress?: string
  short_term_progress?: string
  issues?: string
  next_actions?: string
  specialized_support?: string
  overall_status?: string
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  ongoing:      { label: '継続中',    variant: 'secondary' },
  achieved:     { label: '目標達成',  variant: 'success' },
  revised:      { label: '計画見直し', variant: 'warning' },
  needs_review: { label: '要検討',    variant: 'destructive' },
}

interface Props {
  record: MonitoringRecord
  supportPlanId: string | null
  childId: string
  readOnly?: boolean
}

export function MonitoringRecordEditCard({ record, supportPlanId, childId, readOnly }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [recordDate, setRecordDate] = useState(record.record_date)
  const [overallStatus, setOverallStatus] = useState(record.overall_status)
  const [longTermProgress, setLongTermProgress] = useState(record.long_term_progress ?? '')
  const [shortTermProgress, setShortTermProgress] = useState(record.short_term_progress ?? '')
  const [issues, setIssues] = useState(record.issues ?? '')
  const [nextActions, setNextActions] = useState(record.next_actions ?? '')
  const [specializedSupport, setSpecializedSupport] = useState(record.specialized_support ?? '')
  const [familyWishes, setFamilyWishes] = useState(record.family_wishes ?? '')
  const [agencyNotes, setAgencyNotes] = useState<AgencyNote[]>(record.agency_notes ?? [])
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
    setSaving(true)
    await supabase.from('monitoring_records').update({
      record_date: recordDate,
      overall_status: overallStatus,
      long_term_progress: longTermProgress || null,
      short_term_progress: shortTermProgress || null,
      issues: issues || null,
      next_actions: nextActions || null,
      specialized_support: specializedSupport || null,
      family_wishes: familyWishes || null,
      agency_notes: agencyNotes.filter((n) => n.name.trim() || n.content.trim()),
    }).eq('id', record.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const conf = statusConfig[record.overall_status] ?? statusConfig.ongoing

  const fields = [
    { key: 'long_term_progress', resultKey: 'long_term_progress' as keyof AiResult, label: '長期目標の達成状況', value: longTermProgress, setter: setLongTermProgress, rows: 3 },
    { key: 'short_term_progress', resultKey: 'short_term_progress' as keyof AiResult, label: '短期目標の達成状況', value: shortTermProgress, setter: setShortTermProgress, rows: 3 },
    { key: 'issues', resultKey: 'issues' as keyof AiResult, label: '課題', value: issues, setter: setIssues, rows: 3 },
    { key: 'next_actions', resultKey: 'next_actions' as keyof AiResult, label: '今後の対応', value: nextActions, setter: setNextActions, rows: 3 },
    { key: 'specialized_support', resultKey: 'specialized_support' as keyof AiResult, label: '専門的支援', value: specializedSupport, setter: setSpecializedSupport, rows: 3 },
  ] as const

  return (
    <div className="p-3 rounded-lg border border-gray-100 bg-white space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">{formatDate(record.record_date)}</span>
        <div className="flex items-center gap-2">
          <Badge variant={conf.variant}>{conf.label}</Badge>
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

      {!editing ? (
        <>
          {record.long_term_progress && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">長期目標の達成状況</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.long_term_progress}</p>
            </div>
          )}
          {record.short_term_progress && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">短期目標の達成状況</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.short_term_progress}</p>
            </div>
          )}
          {record.issues && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">課題</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.issues}</p>
            </div>
          )}
          {record.next_actions && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">今後の対応</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.next_actions}</p>
            </div>
          )}
          {record.specialized_support && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">専門的支援</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.specialized_support}</p>
            </div>
          )}
          {record.family_wishes && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">家族の要望</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.family_wishes}</p>
            </div>
          )}
          {record.agency_notes && record.agency_notes.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">関係事業所の記録</p>
              <div className="space-y-1.5">
                {record.agency_notes.map((note, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                    {note.name && <p className="text-xs font-medium text-gray-600 mb-0.5">{note.name}</p>}
                    {note.content && <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 pt-1">
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
              <label className="text-xs font-medium text-gray-700 mb-1 block">総合評価</label>
              <select
                value={overallStatus}
                onChange={(e) => setOverallStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>

          {fields.map(({ key, resultKey, label, value, setter, rows }) => (
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
                rows={rows}
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
              rows={3}
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

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>キャンセル</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存する'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
