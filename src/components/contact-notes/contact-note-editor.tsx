'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Send, Save } from 'lucide-react'
import { AutoTextarea } from '@/components/ui/auto-textarea'

interface Props {
  noteId: string
  initialContent: string
  initialPublished: boolean
  aiDraft: string | null
  childId: string
  date: string
  /** 編集できるか（システム管理者だけ）。false なら本文を表示するだけ */
  canEdit?: boolean
}

export function ContactNoteEditor({
  noteId,
  initialContent,
  initialPublished,
  aiDraft,
  childId,
  date,
  canEdit = true,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [content, setContent] = useState(initialContent)
  const [published, setPublished] = useState(initialPublished)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleGenerateAI = async () => {
    if (!canEdit) return
    setGenerating(true)
    const res = await fetch('/api/contact-notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId, date }),
    })
    if (res.ok) {
      const json = await res.json()
      if (json.draft) setContent(json.draft)
    }
    setGenerating(false)
  }

  const handleSave = async (publish: boolean) => {
    if (!canEdit) return
    setSaving(true)
    await supabase.from('contact_notes').update({
      content,
      published_at: publish ? new Date().toISOString() : null,
    }).eq('id', noteId)
    setSaving(false)
    setPublished(publish)
    startTransition(() => router.refresh())
  }

  // 閲覧のみ（施設長・スタッフ）：本文と公開状態を表示するだけ
  if (!canEdit) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">連絡帳内容</CardTitle>
            <span className="text-xs text-gray-500">{published ? '公開済' : '下書き'}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            連絡帳は閲覧のみです。この画面での編集・AI下書き・公開はできません。
          </p>
          {content.trim() ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
          ) : (
            <p className="text-sm text-gray-400">本文はまだありません</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">連絡帳内容</CardTitle>
          <Button
            onClick={handleGenerateAI}
            disabled={generating}
            variant="outline"
            size="sm"
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'AI生成中...' : 'AI下書き'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiDraft && content === initialContent && (
          <div className="p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700">
            <p className="font-medium mb-1">AI下書き（参考）</p>
            <p className="whitespace-pre-wrap text-indigo-600">{aiDraft}</p>
            <button
              onClick={() => setContent(aiDraft)}
              className="mt-2 text-xs underline text-indigo-500 hover:text-indigo-700"
            >
              この内容を使う
            </button>
          </div>
        )}

        <AutoTextarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          minRows={8}
          placeholder="今日の活動や様子を記入してください"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="flex gap-2">
          <Button
            onClick={() => handleSave(false)}
            disabled={saving}
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
            {published ? '更新して公開' : '保護者に公開'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
