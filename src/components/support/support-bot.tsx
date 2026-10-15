'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LifeBuoy,
  X,
  Send,
  Loader2,
  Flag,
  CheckCircle2,
  RotateCcw,
  Database,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AutoTextarea } from '@/components/ui/auto-textarea'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** ボットが回答の根拠として参照したデータの表示名 */
  checked?: string[]
}

const GREETING =
  'アプリのことでお困りですか。使い方でも、「入力を間違えた」「表示がおかしい」といった相談でも大丈夫です。\n' +
  '児童名と日付を教えていただければ、実際の記録を確認して原因をお調べします。\n' +
  '例：「山田さんの8月12日の送迎時間がおかしい」'

export function SupportBot() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [inquiryId, setInquiryId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 拡大表示：サイドバーを除いた画面いっぱいに広げる（1か月分の日誌などを読みやすく）
  const [expanded, setExpanded] = useState(false)
  const [area, setArea] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 拡大時に覆う範囲＝ヘッダーとメインを並べた列（サイドバーの右側）。
  // サイドバーは折りたたみで幅が変わるので、固定値ではなく実際の位置を測って追従する。
  useEffect(() => {
    if (!open || !expanded) return
    const column = rootRef.current?.closest('header')?.parentElement
    if (!column) return
    const measure = () => {
      const r = column.getBoundingClientRect()
      setArea({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(column)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open, expanded])

  // 拡大中は Esc で元の大きさに戻す
  useEffect(() => {
    if (!open || !expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, expanded])

  // 新しい発言が増えたら最下部へ
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending, escalated])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open, expanded])

  const reset = () => {
    setMessages([])
    setInput('')
    setInquiryId(null)
    setEscalated(false)
    setError(null)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    setError(null)
    setSending(true)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, message: text, pagePath: pathname }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '送信できませんでした')
        // 送った文面を打ち直させないよう入力欄へ戻す
        setMessages((prev) => prev.slice(0, -1))
        setInput(text)
        return
      }

      setInquiryId(data.inquiryId)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, checked: data.checked ?? [] },
      ])
    } catch {
      setError('通信に失敗しました。電波状況をご確認ください。')
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  const escalate = async () => {
    if (!inquiryId || escalating) return
    setError(null)
    setEscalating(true)

    try {
      const res = await fetch('/api/support/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '報告できませんでした')
        return
      }
      setEscalated(true)
    } catch {
      setError('通信に失敗しました。電波状況をご確認ください。')
    } finally {
      setEscalating(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* ヘッダーのお知らせベルの左隣に並ぶトグル */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        title="サポートに質問する"
        aria-label="サポートに質問する"
        className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
      >
        <LifeBuoy className="h-5 w-5" />
      </Button>

      {/* お知らせメニューと同じく、アイコンの真下に開く */}
      {open && (
        <div
          className={cn(
            'z-50 flex flex-col overflow-hidden bg-white',
            expanded && area
              ? 'fixed border-l border-gray-200 shadow-xl'
              : 'absolute right-0 top-11 max-h-[min(38rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2.5rem))] rounded-xl border border-gray-200 shadow-2xl',
          )}
          style={expanded && area ? area : undefined}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">サポート</p>
                <p className="text-[11px] leading-tight text-indigo-100">
                  使い方・不具合の相談（AIが回答します）
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-indigo-500"
                aria-label={expanded ? '元の大きさに戻す' : '拡大表示'}
                title={expanded ? '元の大きさに戻す（Esc）' : '拡大表示'}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                <span>{expanded ? '縮小' : '拡大'}</span>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-indigo-500"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 会話 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 p-3">
            <div className={cn('space-y-3', expanded && 'mx-auto max-w-4xl py-2')}>
              <Bubble role="assistant" content={GREETING} />

              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} checked={m.checked} />
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  マニュアルと記録を確認しています…
                  <span className="text-gray-400">（データを調べる場合は30秒ほどかかります）</span>
                </div>
              )}

              {escalated && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    管理者に報告しました
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    ここまでの会話を整理して、管理者の対応待ち一覧に登録しました。 対応状況は
                    <Link href="/support" className="mx-1 underline" onClick={() => setOpen(false)}>
                      サポート問い合わせ
                    </Link>
                    から確認できます。
                  </p>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* 操作 */}
          <div className="border-t border-gray-100 bg-white p-2.5">
            <div className={cn(expanded && 'mx-auto max-w-4xl')}>
              {messages.length > 0 && !escalated && (
                <button
                  onClick={escalate}
                  disabled={escalating || sending || !inquiryId}
                  className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {escalating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Flag className="h-3.5 w-3.5" />
                  )}
                  解決しない・不具合のようだ → 管理者に報告
                </button>
              )}

              {escalated ? (
                <button
                  onClick={reset}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  新しく質問する
                </button>
              ) : (
                <div className="flex items-end gap-2">
                  <AutoTextarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      // Enterで送信、Shift+Enterで改行。IME変換中のEnterは無視する
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    minRows={2}
                    maxRows={8}
                    maxLength={2000}
                    placeholder="例：山田さんの8月12日の送迎時間が直りません"
                    className="flex-1 rounded-md border border-gray-300 px-2.5 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !input.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                    aria-label="送信"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}

              <p className="mt-1.5 text-center text-[10px] text-gray-400">
                AIの回答が誤っていることもあります。おかしいと思ったら管理者に報告してください。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ role, content, checked }: ChatMessage) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%]', isUser ? 'text-right' : '')}>
        <div
          className={cn(
            'whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm leading-relaxed',
            isUser ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-800',
          )}
        >
          {content}
        </div>
        {/* 何を見て答えたのかを必ず示す。根拠の分からない指摘で記録を直させないため */}
        {!isUser && checked && checked.length > 0 && (
          <p className="mt-1 flex items-start gap-1 text-[10px] leading-relaxed text-gray-500">
            <Database className="mt-0.5 h-3 w-3 shrink-0" />
            <span>確認したデータ：{checked.join('、')}</span>
          </p>
        )}
      </div>
    </div>
  )
}
