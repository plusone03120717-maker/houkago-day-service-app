'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BellRing, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notifyScheduleWeek } from '@/app/actions/schedule-week'
import { weekLabel } from '@/lib/schedule-week-confirm'

type PendingWeek = { weekStart: string; childNames: string[] }

/** 画面を開いている間、どのくらいの間隔で確かめるか */
const POLL_MS = 20_000
/** 「あとで」を押した内容（変わったらまた出す） */
const DISMISS_KEY = 'schedule-change-prompt:dismissed'

function signature(weeks: PendingWeek[]): string {
  return weeks.map((w) => `${w.weekStart}:${[...w.childNames].sort().join(',')}`).join('|')
}

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function writeDismissed(value: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, value)
  } catch {
    // 保存できなくても、この画面の間は閉じたままにする
  }
}

/**
 * 「変更を知らせる」の押し忘れを防ぐ確認。
 *
 * 予定を保存する画面はいくつもあり、ブラウザから直接書きこむ所もあるので、
 * 保存ボタンごとではなく、画面の共通の枠で「保護者に知らせた週の予定が変わったのに、
 * まだ知らせていない」かを確かめて聞く（画面の切りかえ・窓に戻ったとき・20秒ごと）。
 *
 * 「あとで」を押すと、変わった児童が増えるまで出さない。
 * 押し忘れても、日曜17時に自動で知らせる（/api/cron/schedule-week-auto-notify）。
 * 知らせるボタンを押せる人（システム管理者）の画面にだけ置く。
 */
export function ScheduleChangePrompt() {
  const router = useRouter()
  const pathname = usePathname()
  const [weeks, setWeeks] = useState<PendingWeek[]>([])
  // 最初は何も出していない（weeks が空）ので、読みこみ時に保存した値を読んでも表示は食い違わない
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readDismissed()
  )
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const inFlight = useRef(false)

  const check = useCallback(async () => {
    if (inFlight.current || document.visibilityState !== 'visible') return
    inFlight.current = true
    try {
      const res = await fetch('/api/schedule-week/pending', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { weeks?: PendingWeek[] }
      setWeeks(json.weeks ?? [])
    } catch {
      // 通信できないときは何も出さない（次の確かめで出る）
    } finally {
      inFlight.current = false
    }
  }, [])

  // 画面を切りかえたとき（保存のあとに一覧へ戻るときなど）
  useEffect(() => {
    const t = window.setTimeout(() => void check(), 0)
    return () => window.clearTimeout(t)
  }, [pathname, check])

  // 窓に戻ったとき・開いている間は20秒ごと
  useEffect(() => {
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const timer = window.setInterval(() => void check(), POLL_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      window.clearInterval(timer)
    }
  }, [check])

  const sig = signature(weeks)
  const visible = (weeks.length > 0 && sig !== dismissed) || message !== null
  if (!visible) return null

  const later = () => {
    writeDismissed(sig)
    setDismissed(sig)
    setMessage(null)
  }

  const notifyNow = async () => {
    setSending(true)
    setMessage(null)
    const errors: string[] = []
    for (const w of weeks) {
      const result = await notifyScheduleWeek(w.weekStart)
      if (result.error) errors.push(`${weekLabel(w.weekStart)}：${result.error}`)
    }
    setSending(false)
    if (errors.length > 0) {
      setMessage({ tone: 'error', text: errors.join('\n') })
      return
    }
    setWeeks([])
    setMessage({ tone: 'ok', text: '保護者の画面に変更のお知らせを出しました' })
    router.refresh()
    window.setTimeout(() => setMessage(null), 4000)
  }

  return (
    <div
      role="dialog"
      aria-labelledby="schedule-change-prompt-title"
      className="fixed bottom-5 right-5 z-50 w-[22rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-indigo-200 bg-white p-4 shadow-xl"
    >
      {weeks.length > 0 && sig !== dismissed ? (
        <>
          <div className="flex items-start gap-2">
            <BellRing className="mt-0.5 h-4 w-4 flex-none text-indigo-600" />
            <p id="schedule-change-prompt-title" className="flex-1 text-sm font-bold text-gray-900">
              保護者に知らせた週の予定が変わりました。変更を保護者に知らせますか？
            </p>
            <button type="button" onClick={later} aria-label="閉じる" className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-gray-600">
            {weeks.map((w) => (
              <li key={w.weekStart}>
                <span className="font-medium text-gray-800">{weekLabel(w.weekStart)}</span>
                ：{w.childNames.length}人（{w.childNames.slice(0, 3).join('・')}
                {w.childNames.length > 3 ? ' ほか' : ''}）
              </li>
            ))}
          </ul>
          <p className="mt-2 pl-6 text-[11px] text-gray-400">
            いくつか直す途中なら「あとで」。知らせ忘れても、日曜17時に自動で知らせます。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={later} disabled={sending}>
              あとでまとめて知らせる
            </Button>
            <Button size="sm" onClick={notifyNow} disabled={sending}>
              {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              今すぐ知らせる
            </Button>
          </div>
        </>
      ) : null}
      {message && (
        <p className={`whitespace-pre-line text-xs ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'} ${weeks.length > 0 && sig !== dismissed ? 'mt-2' : ''}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
