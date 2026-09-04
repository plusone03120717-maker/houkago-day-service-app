'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, BookMarked, Sparkles, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { reflectToInternalManual } from '@/app/actions/minutes'
import { CATEGORIES, CATEGORY_META, type Category } from '@/lib/internal-manual/categories'

type Item = {
  category: Category
  content: string
  source: string
  /** 反映するかどうか。既定は選択済み（外したいものを外してもらう） */
  selected: boolean
}

/**
 * 議事録から社内マニュアル行きの項目を抜き出すパネル（管理者のみ）。
 *
 * 抜き出した内容は記事ではなく「メモ」として登録する。
 * 既存の「メモを溜めて記事に起こす」流れに合流させることで、
 * 記事になる前にもう一度目を通す段が入る。
 */
export function ReflectPanel({
  minutesId,
  reflectedAt,
}: {
  minutesId: string
  reflectedAt: string | null
}) {
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const extract = async () => {
    if (running) return
    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/minutes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutesId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? '抽出できませんでした')
        return
      }
      const found = (data.items ?? []) as Omit<Item, 'selected'>[]
      if (found.length === 0) {
        setItems([])
        setMessage('この議事録に、社内マニュアルへ載せるべき決めごとは見つかりませんでした。')
        return
      }
      setItems(found.map((i) => ({ ...i, selected: true })))
    } catch {
      setMessage('通信に失敗しました')
    } finally {
      setRunning(false)
    }
  }

  const apply = () => {
    const chosen = (items ?? []).filter((i) => i.selected)
    if (chosen.length === 0) {
      setMessage('反映する項目を選んでください')
      return
    }
    start(async () => {
      setMessage(null)
      const result = await reflectToInternalManual(
        minutesId,
        chosen.map((i) => ({ category: i.category, content: i.content }))
      )
      if (result.error) {
        setMessage(result.error)
        return
      }
      setItems(null)
      setMessage(`社内マニュアルのメモとして${result.created}件を登録しました。`)
      router.refresh()
    })
  }

  const update = (index: number, patch: Partial<Item>) =>
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, ...patch } : it)) ?? null)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookMarked className="h-5 w-5 text-amber-500" />
          社内マニュアルへ反映
        </CardTitle>
        <Button size="sm" variant="outline" disabled={running || pending} onClick={extract}>
          {running ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {running ? '読んでいます…' : '載せるべきことを抜き出す'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <p className="text-sm leading-relaxed text-gray-600">
          議事録から「今後の運用として続く決めごと」を抜き出し、社内マニュアルのメモとして登録します。
          登録したメモは
          <Link href="/internal-manual" className="mx-1 text-indigo-600 underline">
            社内マニュアル
          </Link>
          の各分類に並び、そこで記事にまとめて公開すると、サポートボットが答えられるようになります。
        </p>

        {reflectedAt && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            この議事録はすでに社内マニュアルへ反映済みです。もう一度実行すると、同じ内容のメモが
            重複して登録されることがあります。
          </p>
        )}

        {items && items.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              反映するものにチェックを入れてください。分類と文面はその場で直せます。
            </p>
            {items.map((item, index) => (
              <div
                key={index}
                className={`rounded-lg border p-3 ${
                  item.selected ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => update(index, { selected: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span className="text-xs font-medium text-gray-700">この項目を反映する</span>
                </label>

                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => update(index, { category: c })}
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${
                          item.category === c
                            ? CATEGORY_META[c].className
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {CATEGORY_META[c].label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={item.content}
                    onChange={(e) => update(index, { content: e.target.value })}
                    rows={3}
                    className="w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
                  />

                  {/* 議事録のどこから拾ったのかを見せる。抽出の当たり外れを判断できるように */}
                  {item.source && (
                    <p className="text-xs text-gray-500">
                      議事録の該当箇所：{item.source}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <Button size="sm" disabled={pending} onClick={apply}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              選んだ項目を社内マニュアルへ送る
            </Button>
          </div>
        )}

        {message && <p className="text-sm text-gray-600">{message}</p>}
      </CardContent>
    </Card>
  )
}
