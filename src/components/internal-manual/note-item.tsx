'use client'

import { useState, useTransition } from 'react'
import { Loader2, Pencil, Trash2, Archive, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteNote, setNoteStatus, updateNote } from '@/app/actions/internal-manual'

export function NoteItem({
  id,
  content,
  authorName,
  createdAt,
  linkedToArticle,
  canEdit,
}: {
  id: string
  content: string
  authorName: string | null
  createdAt: string
  /** すでにAIの下書きに取り込まれているか */
  linkedToArticle: boolean
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const result = await updateNote(id, draft)
      if (!result.error) setEditing(false)
    })

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>{authorName ?? '職員'}</span>
        <span>{createdAt}</span>
        {linkedToArticle && (
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            下書きに取り込み済み（公開待ち）
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={pending || !draft.trim()} onClick={save}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(content)
                setEditing(false)
              }}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {content}
          </p>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                編集
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => start(async () => void (await setNoteStatus(id, 'archived')))}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                見送りにする
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (!confirm('このメモを削除します。よろしいですか？')) return
                  start(async () => void (await deleteNote(id)))
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                削除
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
