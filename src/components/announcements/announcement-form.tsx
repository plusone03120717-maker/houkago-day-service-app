'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Send } from 'lucide-react'

type Unit = { id: string; name: string }

interface Props {
  units: Unit[]
  facilityId: string
}

export function AnnouncementForm({ units, facilityId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'unit'>('all')
  const [targetUnitId, setTargetUnitId] = useState(units[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async (publish: boolean) => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    await supabase.from('announcements').insert({
      facility_id: facilityId,
      title: title.trim(),
      content: content.trim(),
      target_type: targetType,
      target_unit_id: targetType === 'unit' ? targetUnitId : null,
      published_at: publish ? new Date().toISOString() : null,
    })
    setSaving(false)
    setTitle('')
    setContent('')
    setOpen(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left w-full"
        >
          <Plus className="h-4 w-4 text-indigo-600" />
          <CardTitle className="text-base">新しいお知らせを作成</CardTitle>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">タイトル</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：7月の行事予定について"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="お知らせの内容を入力してください"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">配信対象</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="all"
                  checked={targetType === 'all'}
                  onChange={() => setTargetType('all')}
                  className="text-indigo-600"
                />
                全保護者
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="unit"
                  checked={targetType === 'unit'}
                  onChange={() => setTargetType('unit')}
                  className="text-indigo-600"
                />
                ユニット限定
              </label>
            </div>
            {targetType === 'unit' && units.length > 0 && (
              <select
                value={targetUnitId}
                onChange={(e) => setTargetUnitId(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleSave(false)}
              disabled={saving || !title.trim() || !content.trim()}
              variant="outline"
              size="sm"
            >
              下書き保存
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving || !title.trim() || !content.trim()}
              size="sm"
            >
              <Send className="h-4 w-4" />
              {saving ? '送信中...' : '公開する'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
