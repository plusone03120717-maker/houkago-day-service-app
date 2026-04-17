'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Bot, Loader2, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

type Meeting = {
  id: string
  meeting_date: string
  attendees: string | null
  content: string
  created_at: string
}

interface Props {
  childId: string
  initial?: Meeting
  onSaved?: () => void
  onDeleted?: () => void
}

export function FamilyMeetingForm({ childId, initial, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const [date, setDate] = useState(initial?.meeting_date ?? new Date().toISOString().slice(0, 10))
  const [attendees, setAttendees] = useState(initial?.attendees ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [refining, setRefining] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(!initial)

  const handleSave = async () => {
    if (!content.trim()) { setError('内容を入力してください'); return }
    setSaving(true)
    setError('')
    const payload = {
      child_id: childId,
      meeting_date: date,
      attendees: attendees || null,
      content,
    }
    if (initial) {
      const { error: err } = await supabase.from('family_meetings').update(payload).eq('id', initial.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('family_meetings').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved?.()
  }

  const handleDelete = async () => {
    if (!initial || !confirm('この記録を削除しますか？')) return
    setDeleting(true)
    await supabase.from('family_meetings').delete().eq('id', initial.id)
    setDeleting(false)
    onDeleted?.()
  }

  const handleRefine = async () => {
    if (!content.trim()) return
    setRefining(true)
    try {
      const res = await fetch('/api/support-plans/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType: 'family_meeting', content }),
      })
      const json = await res.json()
      if (json.refined) setContent(json.refined)
    } finally {
      setRefining(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* ヘッダー */}
      <button
        type="button"
        onClick={() => initial && setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">{date}</span>
          {attendees && <span className="text-xs text-gray-500">参加者: {attendees}</span>}
          {initial && !expanded && (
            <span className="text-xs text-gray-400 truncate max-w-xs hidden sm:block">{content.slice(0, 40)}…</span>
          )}
        </div>
        {initial && (expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />)}
      </button>

      {/* 本体 */}
      {expanded && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">会議日</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">参加者</label>
              <Input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="保護者・担当者・相談支援員など"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">会議内容・メモ</label>
              <button
                type="button"
                onClick={handleRefine}
                disabled={refining || !content.trim()}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
              >
                {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                文章を整える
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="話し合いの内容、決定事項、今後の方針などをメモしてください..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between">
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? '保存中...' : '保存'}
            </Button>
            {initial && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                削除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
