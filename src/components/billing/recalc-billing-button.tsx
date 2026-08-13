'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { recalcBillingFromRecords, type RecalcResult } from '@/app/actions/billing'

export function RecalcBillingButton({
  unitId,
  yearMonth,
  variant = 'default',
}: {
  unitId: string
  yearMonth: string
  variant?: 'default' | 'outline'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<RecalcResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await recalcBillingFromRecords(unitId, yearMonth)
      if (res.error) {
        setError(res.error)
        return
      }
      setResult(res)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={handleClick} disabled={pending} size="sm" variant={variant}>
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
          {pending ? '集計中...' : '出席実績から再集計'}
        </Button>
        <span className="text-xs text-gray-400">
          出席記録・月次サービス実績から利用日数と単位数を計算します（手入力した値は上書きされます）
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
            <p className="font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.childCount}名分を再集計しました
            </p>
            <p className="mt-1 text-green-700">
              総利用日数 {result.totalDays}日 ／ 単位数 {result.totalUnits.toLocaleString()} ／
              給付費請求額 {result.billedAmount.toLocaleString()}円
            </p>
          </div>

          {result.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                警告
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {result.childErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                CSV出力前に直す必要がある項目（{result.childErrors.length}件）
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.childErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
