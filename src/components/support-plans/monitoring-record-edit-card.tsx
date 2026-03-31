'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Wand2, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type MonitoringRecord = {
  id: string
  record_date: string
  long_term_progress: string | null
  short_term_progress: string | null
  issues: string | null
  next_actions: string | null
  overall_status: string
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  ongoing:      { label: '継続中',    variant: 'secondary' },
  achieved:     { label: '目標達成',  variant: 'success' },
  revised:      { label: '計画見直し', variant: 'warning' },
  needs_review: { label: '要検討',    variant: 'destructive' },
}

interface Props {
  record: MonitoringRecord
  readOnly?: boolean
}

export function MonitoringRecordEditCard({ record, readOnly }: Props) {
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
    await supabase.from('monitoring_records').update({
      record_date: recordDate,
      overall_status: overallStatus,
      long_term_progress: longTermProgress || null,
      short_term_progress: shortTermProgress || null,
      issues: issues || null,
      next_actions: nextActions || null,
    }).eq('id', record.id)
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const conf = statusConfig[record.overall_status] ?? statusConfig.ongoing

  const fields = [
    { key: 'long_term_progress', label: '長期目標の達成状況', value: longTermProgress, setter: setLongTermProgress, rows: 3 },
    { key: 'short_term_progress', label: '短期目標の達成状況', value: shortTermProgress, setter: setShortTermProgress, rows: 3 },
    { key: 'issues', label: '課題', value: issues, setter: setIssues, rows: 3 },
    { key: 'next_actions', label: '今後の対応', value: nextActions, setter: setNextActions, rows: 3 },
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
