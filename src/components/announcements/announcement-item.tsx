'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Bell, Pencil, Trash2, Send } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Unit = { id: string; name: string }

export type AnnouncementItemData = {
  id: string
  title: string
  content: string
  target_type: string
  target_unit_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  units: { name: string } | null
}

interface Props {
  announcement: AnnouncementItemData
  units: Unit[]
}

export function AnnouncementItem({ announcement: ann, units }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(ann.title)
  const [content, setContent] = useState(ann.content)
  const [targetType, setTargetType] = useState<'all' | 'unit'>(ann.target_type === 'unit' ? 'unit' : 'all')
  const [targetUnitId, setTargetUnitId] = useState(ann.target_unit_id ?? units[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPublished = !!ann.published_at
  // 作成から1分以上経って更新されていれば「編集済み」とみなす
  const edited = new Date(ann.updated_at).getTime() - new Date(ann.created_at).getTime() > 60_000

  const startEdit = () => {
    setTitle(ann.title)
    setContent(ann.content)
    setTargetType(ann.target_type === 'unit' ? 'unit' : 'all')
    setTargetUnitId(ann.target_unit_id ?? units[0]?.id ?? '')
    setError(null)
    setEditing(true)
  }

  // publish: true=公開する / false=下書きに戻す / undefined=公開状態はそのまま
  const handleSave = async (publish?: boolean) => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    setError(null)
    const update: Record<string, unknown> = {
      title: title.trim(),
      content: content.trim(),
      target_type: targetType,
      target_unit_id: targetType === 'unit' ? targetUnitId : null,
    }
    if (publish === true && !isPublished) update.published_at = new Date().toISOString()
    if (publish === false) update.published_at = null
    const { error: updateError } = await supabase.from('announcements').update(update).eq('id', ann.id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditing(false)
    startTransition(() => router.refresh())
  }

  const handleDelete = async () => {
    const msg = isPublished
      ? `「${ann.title}」を削除しますか？\n保護者の画面からも見えなくなります。この操作は取り消せません。`
      : `下書き「${ann.title}」を削除しますか？この操作は取り消せません。`
    if (!confirm(msg)) return
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase.from('announcements').delete().eq('id', ann.id)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    startTransition(() => router.refresh())
  }

  if (editing) {
    return (
      <Card className="border-indigo-200">
        <CardContent className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">タイトル</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">内容</label>
            <AutoTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              minRows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">配信対象</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={targetType === 'all'}
                  onChange={() => setTargetType('all')}
                  className="text-indigo-600"
                />
                全保護者
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
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

          {isPublished && (
            <p className="text-xs text-gray-500">
              公開中のお知らせです。保存すると保護者の画面にもすぐ反映されます（再通知はされません）。
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditing(false)} disabled={saving} variant="ghost" size="sm">
              キャンセル
            </Button>
            {isPublished ? (
              <>
                <Button
                  onClick={() => handleSave(false)}
                  disabled={saving || !title.trim() || !content.trim()}
                  variant="outline"
                  size="sm"
                >
                  下書きに戻す
                </Button>
                <Button
                  onClick={() => handleSave()}
                  disabled={saving || !title.trim() || !content.trim()}
                  size="sm"
                >
                  {saving ? '保存中...' : '保存する'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => handleSave()}
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
                  {saving ? '保存中...' : '公開する'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bell className="h-4 w-4 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{ann.title}</p>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{ann.content}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">{formatDate(ann.created_at)}</span>
                {edited && (
                  <span className="text-xs text-gray-400">（{formatDate(ann.updated_at)} 編集）</span>
                )}
                <Badge variant="secondary" className="text-xs">
                  {ann.target_type === 'all' ? '全保護者' : ann.units?.name ?? 'ユニット限定'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Badge variant={isPublished ? 'success' : 'secondary'}>
              {isPublished ? '公開中' : '下書き'}
            </Badge>
            <div className="flex gap-1">
              <button
                onClick={startEdit}
                disabled={saving}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                aria-label="編集"
                title="編集"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                aria-label="削除"
                title="削除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
