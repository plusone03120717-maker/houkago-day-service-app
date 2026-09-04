'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createArticle } from '@/app/actions/internal-manual'

/**
 * 溜まったメモから記事の下書きを作らせる。
 *
 * 生成した内容はいきなり公開せず、必ず下書きとして置く。
 * 公開するかどうかの判断は管理者が目で見て行う。
 */
export function GenerateDraftButton({
  category,
  noteCount,
}: {
  category: string
  noteCount: number
}) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async () => {
    if (running) return
    if (!confirm(`未反映のメモ${noteCount}件から、マニュアルの下書きを作ります。よろしいですか？`)) {
      return
    }

    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/internal-manual/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? '下書きを作成できませんでした')
        return
      }
      setMessage(`下書きを作りました（新規${data.created}件・更新${data.updated}件）`)
      router.refresh()
    } catch {
      setMessage('通信に失敗しました')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && <span className="text-xs text-gray-600">{message}</span>}
      <Button size="sm" variant="outline" disabled={running} onClick={run}>
        {running ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        {running ? 'まとめています…' : 'AIで下書きを作る'}
      </Button>
    </div>
  )
}

/** メモを介さず、管理者が直接記事を起こす場合 */
export function NewArticleButton({ category }: { category: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const title = prompt('記事の見出しを入力してください')
        if (!title?.trim()) return
        start(async () => {
          const result = await createArticle(category, title)
          if (result.id) router.push(`/internal-manual/article/${result.id}`)
        })
      }}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="mr-1.5 h-3.5 w-3.5" />
      )}
      記事を作る
    </Button>
  )
}
