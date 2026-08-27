'use client'

import { useState, useTransition } from 'react'
import { Check, EyeOff, RotateCcw, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runCheckNow, updateFindingStatus } from '@/app/actions/anomalies'

export function RunCheckButton() {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-gray-600">{message}</span>}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null)
            const result = await runCheckNow()
            setMessage(result.error ?? `チェックしました（${result.found ?? 0}件）`)
          })
        }
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        今すぐチェック
      </Button>
    </div>
  )
}

export function FindingActions({
  id,
  status,
}: {
  id: string
  status: 'open' | 'resolved' | 'dismissed'
}) {
  const [pending, start] = useTransition()

  const act = (next: 'open' | 'resolved' | 'dismissed', note?: string) =>
    start(async () => {
      await updateFindingStatus(id, next, note)
    })

  if (status !== 'open') {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => act('open')}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        未対応に戻す
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => act('resolved')}>
        <Check className="mr-1.5 h-3.5 w-3.5" />
        直した
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => act('dismissed', '職員が確認して問題なしと判断')}
      >
        <EyeOff className="mr-1.5 h-3.5 w-3.5" />
        問題なし
      </Button>
    </div>
  )
}
