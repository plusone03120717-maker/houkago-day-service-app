'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface Props {
  billingMonthlyId: string
  exportType: 'service_record' | 'billing'
  label: string
}

export function BillingExportButton({ billingMonthlyId, exportType, label }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    const url = `/api/billing/export-csv?billingMonthlyId=${billingMonthlyId}&type=${exportType}`
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="(.+)"/)
      a.download = match?.[1] ?? 'export.csv'
      a.click()
    }
    setLoading(false)
  }

  return (
    <Button onClick={handleExport} disabled={loading} variant="outline" size="sm">
      <Download className="h-4 w-4" />
      {loading ? '出力中...' : label}
    </Button>
  )
}
