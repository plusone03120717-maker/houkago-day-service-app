'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Send, Save } from 'lucide-react'

type AttendedChild = {
  child_id: string
  unit_id: string
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

interface Props {
  date: string
  attended: AttendedChild[]
  defaultChildId?: string
  staffId: string
}

export function NewContactNoteForm({ date, attended, defaultChildId, staffId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [selectedChildId, setSelectedChildId] = useState(defaultChildId ?? attended[0]?.child_id ?? '')
  const [content, setContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedChild = attended.find((a) => a.child_id === selectedChildId)

  const handleGenerateAI = async () => {
    if (!selectedChildId) return
    setGenerating(true)
    const res = await fetch('/api/contact-notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId: selectedChildId, date }),
    })
    if (res.ok) {
      const json = await res.json()
      if (json.draft) setContent(json.draft)
    }
    setGenerating(false)
  }

  const handleSave = async (publish: boolean) => {
    if (!selectedChild || !content.trim()) return
    setSaving(true)

    const { data } = await supabase.from('contact_notes').insert({
      child_id: selectedChild.child_id,
      unit_id: selectedChild.unit_id,
      date,
      content,
      staff_id: staffId,
      published_at: publish ? new Date().toISOString() : null,
    }).select('id').single()

    setSaving(false)
    if (data) {
      startTransition(() => router.push(`/contact-notes/${data.id}`))
    }
  }

  if (attended.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        この日の出席記録がありません
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* 児童選択 */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">対象児童</label>
          <div className="flex flex-wrap gap-2">
            {attended.map((a) => (
              <button
                key={a.child_id}
                onClick={() => setSelectedChildId(a.child_id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedChildId === a.child_id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {a.children?.name ?? '—'}
              </button>
            ))}
          </div>
        </div>

        {/* AI下書き */}
        <Button
          onClick={handleGenerateAI}
          disabled={generating || !selectedChildId}
          variant="outline"
          size="sm"
          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
        >
          <Sparkles className="h-4 w-4" />
          {generating ? 'AI生成中...' : 'AIで下書きを生成'}
        </Button>

        {/* 本文 */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder="今日の活動や様子を記入してください"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleSave(false)}
            disabled={saving || !content.trim()}
            variant="outline"
            size="sm"
          >
            <Save className="h-4 w-4" />
            下書き保存
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving || !content.trim()}
            size="sm"
          >
            <Send className="h-4 w-4" />
            保護者に公開
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
