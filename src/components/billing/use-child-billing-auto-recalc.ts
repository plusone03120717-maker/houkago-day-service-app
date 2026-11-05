'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { recalcChildBilling } from '@/app/actions/billing'

export type AutoRecalcState = {
  status: 'idle' | 'pending' | 'done' | 'notice' | 'error'
  message: string
}

const IDLE: AutoRecalcState = { status: 'idle', message: '' }

/**
 * 児童別の実績画面で実績を変えたら、少し待ってからこの児童の請求明細だけを作り直す。
 * - 続けて変えたときは最後の変更のあとに1回だけ
 * - 実行は順番に1つずつ（古い集計で新しい集計を上書きしない）
 * - 待っている間に画面を離れても反映する
 * 請求データがまだない月・明細を手入力で直した児童は、サーバー側で触らずに理由を返す。
 */
export function useChildBillingAutoRecalc(opts: {
  unitId: string
  /** YYYY-MM */
  yearMonth: string
  childId: string
  disabled?: boolean
}) {
  const { unitId, yearMonth, childId, disabled } = opts
  const [state, setState] = useState<AutoRecalcState>(IDLE)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgs = useRef<[string, string, string] | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const run = useCallback((args: [string, string, string]) => {
    chain.current = chain.current.then(async () => {
      try {
        const r = await recalcChildBilling(...args)
        if (r.error) {
          setState({ status: 'error', message: `請求明細に反映できませんでした: ${r.error}` })
        } else if (r.skipped === 'manual_edit') {
          setState({ status: 'notice', message: '請求明細を手入力で直しているため、自動では反映していません。請求明細の「出席実績から再集計」で反映してください' })
        } else if (r.skipped === 'no_billing') {
          setState({ status: 'notice', message: 'この月の請求データがまだないため、請求明細には反映していません（請求明細の「出席実績から再集計」で作られます）' })
        } else if (r.skipped === 'locked') {
          setState({ status: 'notice', message: 'この月は提出済み（または確定）のため、請求明細には自動で反映していません。直す場合は請求明細の「出席実績から再集計」を押してください' })
        } else if (r.skipped) {
          setState(IDLE)
        } else {
          const csvWarning = r.warnings.find((w) => w.includes('CSV'))
          setState(csvWarning
            ? { status: 'notice', message: `請求明細に反映しました。${csvWarning}` }
            : { status: 'done', message: '請求明細に反映しました' })
        }
      } catch {
        setState({ status: 'error', message: '請求明細に反映できませんでした。請求明細の「出席実績から再集計」を押してください' })
      }
    })
  }, [])

  const schedule = useCallback(() => {
    if (disabled) return
    pendingArgs.current = [unitId, yearMonth.replace('-', ''), childId]
    setState({ status: 'pending', message: '請求明細に反映しています…' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const args = pendingArgs.current
      pendingArgs.current = null
      if (args) run(args)
    }, 1200)
  }, [disabled, unitId, yearMonth, childId, run])

  const dismiss = useCallback(() => setState(IDLE), [])

  // 「反映しました」は少しして消す（注意・エラーは閉じるまで残す）
  useEffect(() => {
    if (state.status !== 'done') return
    const t = setTimeout(() => setState(IDLE), 3000)
    return () => clearTimeout(t)
  }, [state])

  // 待っている間に画面を離れても、変更は請求明細へ反映する
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    const args = pendingArgs.current
    pendingArgs.current = null
    if (args) void recalcChildBilling(...args).catch(() => {})
  }, [])

  return { state, schedule, dismiss }
}
