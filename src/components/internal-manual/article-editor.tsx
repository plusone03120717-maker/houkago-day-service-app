'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Upload, EyeOff, Trash2, Sparkles, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  deleteArticle,
  discardDraft,
  publishArticle,
  saveArticle,
  unpublishArticle,
} from '@/app/actions/internal-manual'

/**
 * 管理者向けの記事編集。
 *
 * AIが作った下書き（draftBody）があるときは、公開中の本文と並べて出す。
 * 何が変わるのかを見ないまま公開させないため、下書きだけを表示する作りにはしない。
 */
export function ArticleEditor({
  id,
  title: initialTitle,
  body: initialBody,
  draftBody,
  status,
}: {
  id: string
  title: string
  body: string
  draftBody: string | null
  status: 'draft' | 'published'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const [title, setTitle] = useState(initialTitle)
  // 下書きがあるときはそれを編集対象にする（公開すると本文に昇格する）
  const [text, setText] = useState(draftBody ?? initialBody)

  const hasDraft = draftBody !== null
  const dirty = title !== initialTitle || text !== (draftBody ?? initialBody)

  const run = (fn: () => Promise<{ error?: string }>, okMessage: string) =>
    start(async () => {
      setMessage(null)
      const result = await fn()
      if (result.error) {
        setMessage(result.error)
        return
      }
      setMessage(okMessage)
      router.refresh()
    })

  const save = () =>
    run(
      () =>
        saveArticle(id, {
          title,
          // 下書き中は公開中の本文に触らない。職員とボットに見えている内容が
          // 確認前に変わってしまわないようにするため
          ...(hasDraft ? { draftBody: text } : { body: text }),
        }),
      '保存しました'
    )

  const publish = () =>
    start(async () => {
      setMessage(null)
      // 編集途中の内容がそのまま公開されるよう、先に保存してから公開する
      const saved = await saveArticle(id, {
        title,
        ...(hasDraft ? { draftBody: text } : { body: text }),
      })
      if (saved.error) {
        setMessage(saved.error)
        return
      }
      const result = await publishArticle(id)
      setMessage(result.error ?? '公開しました。サポートボットが参照するようになります。')
      router.refresh()
    })

  return (
    <div className="space-y-4">
      {hasDraft && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
            <p className="flex items-start gap-2 text-amber-900">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">
                AIが作った未確認の下書きがあります。内容を確かめて直したうえで「公開」を押すと、
                職員とサポートボットに反映されます。
                {status === 'published' && '公開するまで、下の「現在の公開内容」が使われます。'}
              </span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm('AIの下書きを破棄します。よろしいですか？')) return
                run(() => discardDraft(id), '下書きを破棄しました')
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              下書きを破棄
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {hasDraft ? '下書き（編集中）' : '本文'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <label htmlFor="article-title" className="text-xs font-semibold text-gray-500">
              見出し
            </label>
            <Input
              id="article-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="article-body" className="text-xs font-semibold text-gray-500">
              本文
            </label>
            <textarea
              id="article-body"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={18}
              placeholder={'■ 見出し\n・箇条書き\n\n※ 見出しは「■」、箇条書きは「・」で書いてください'}
              className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 font-mono text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={pending || !dirty} onClick={save}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              保存
            </Button>
            <Button size="sm" disabled={pending || !text.trim()} onClick={publish}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {status === 'published' && hasDraft ? 'この内容で更新して公開' : '公開する'}
            </Button>
            {status === 'published' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => unpublishArticle(id), '公開を取り下げました（ボットは読まなくなります）')
                }
              >
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                公開を取り下げる
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm('この記事を削除します。よろしいですか？（もとのメモは残ります）')) {
                  return
                }
                start(async () => {
                  const result = await deleteArticle(id)
                  if (result.error) {
                    setMessage(result.error)
                    return
                  }
                  router.push('/internal-manual')
                })
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              削除
            </Button>
            {message && <span className="text-sm text-gray-600">{message}</span>}
          </div>
        </CardContent>
      </Card>

      {/* 下書きと見比べられるよう、いま職員に見えている内容も出す */}
      {hasDraft && status === 'published' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-600">
              現在の公開内容（いまボットが読んでいるもの）
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
              {initialBody || '（本文なし）'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
