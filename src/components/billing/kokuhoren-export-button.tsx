'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileDown, AlertCircle, AlertTriangle } from 'lucide-react'

interface Props {
  billingMonthlyId: string
  /** 出力するCSVの種類 */
  kind?: 'billing' | 'service_record'
}

const KINDS = {
  billing: {
    endpoint: '/api/billing/export-kokuhoren',
    label: '国保連取込用CSV（仕様準拠）',
    fallbackFileName: 'K112.CSV',
  },
  service_record: {
    endpoint: '/api/billing/export-service-record',
    label: 'サービス提供実績記録票CSV（仕様準拠）',
    fallbackFileName: 'K611.CSV',
  },
} as const

export function KokuhorenExportButton({ billingMonthlyId, kind = 'billing' }: Props) {
  const config = KINDS[kind]
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const handleExport = async () => {
    setLoading(true)
    setErrors([])
    setWarnings([])
    try {
      const res = await fetch(`${config.endpoint}?billingMonthlyId=${billingMonthlyId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErrors(body?.errors ?? [body?.error ?? '出力に失敗しました'])
        setWarnings(body?.warnings ?? [])
        return
      }
      const warningsHeader = res.headers.get('X-Kokuhoren-Warnings')
      if (warningsHeader) {
        try {
          setWarnings(JSON.parse(decodeURIComponent(warningsHeader)))
        } catch {
          // ヘッダー解析失敗は無視（ダウンロード自体は成功）
        }
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="(.+)"/)
      a.download = match?.[1] ?? config.fallbackFileName
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleExport} disabled={loading} size="sm">
        <FileDown className="h-4 w-4" />
        {loading ? '出力中...' : config.label}
      </Button>

      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            出力できませんでした（{errors.length}件のエラー）
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            警告（出力は完了しています）
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
