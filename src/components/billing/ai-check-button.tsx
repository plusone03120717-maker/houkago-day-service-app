'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

interface Props {
  billingMonthlyId: string
}

export function AiCheckButton({ billingMonthlyId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheck = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/ai-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingMonthlyId }),
      })
      const data = await res.json() as { result?: string; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? 'エラーが発生しました')
      } else {
        setResult(data.result ?? '')
        setOpen(true)
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={handleCheck}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-purple-200 text-purple-700 hover:bg-purple-50"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? 'AI分析中...' : 'AIエラーチェック'}
        </Button>
        {result && (
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {open ? '結果を閉じる' : '前回の結果を表示'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && open && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">AI分析レポート</span>
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {result}
          </div>
        </div>
      )}
    </div>
  )
}
