'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addNote } from '@/app/actions/internal-manual'

/**
 * メモの投稿欄。
 * 「整った文章でなくてよい」ことが伝わらないと誰も書かないので、
 * 例示と補足でハードルを下げている。
 */
export function NoteForm({ category }: { category: string }) {
  const [content, setContent] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    const text = content.trim()
    if (!text) return
    start(async () => {
      setMessage(null)
      const result = await addNote(category, text)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setContent('')
      setMessage('メモを追加しました')
    })
  }

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter で送信。通常のEnterは改行のまま（長文を書くことがあるため）
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
        rows={4}
        maxLength={2000}
        placeholder={
          '例：送迎中に体調不良が出たら、事業所に戻らず先に保護者へ電話する\n' +
          '例：初回面談の持ち物は受給者証・母子手帳・印鑑\n' +
          '箇条書きでも、言い切らない書き方でも大丈夫です。'
        }
        className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={pending || !content.trim()} onClick={submit}>
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          メモを追加
        </Button>
        <span className="text-xs text-gray-500">Ctrl + Enter でも追加できます</span>
        {message && <span className="text-sm text-gray-600">{message}</span>}
      </div>
    </div>
  )
}
