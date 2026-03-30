'use client'

import { useState } from 'react'
import { BillingDetailRow } from './billing-detail-row'

type Detail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  service_code: string | null
  unit_price: number
  copay_amount: number
  billed_amount: number
  errors: string[]
  children: { name: string; name_kana: string | null } | null
}

export function BillingDetailsTable({ initial }: { initial: Detail[] }) {
  const [details, setDetails] = useState<Detail[]>(initial)

  const totalDays = details.reduce((s, d) => s + d.total_days, 0)
  const totalUnits = details.reduce((s, d) => s + d.total_units, 0)
  const totalBilled = details.reduce((s, d) => s + d.billed_amount, 0)
  const totalCopay = details.reduce((s, d) => s + d.copay_amount, 0)

  const handleUpdated = (updated: Detail) => {
    setDetails((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="text-left py-2 pr-3 font-medium">氏名（サービスコード）</th>
            <th className="text-right py-2 px-3 font-medium">利用日数</th>
            <th className="text-right py-2 px-3 font-medium">単位数</th>
            <th className="text-right py-2 px-3 font-medium">給付単価</th>
            <th className="text-right py-2 px-3 font-medium">給付費請求額</th>
            <th className="text-right py-2 pl-3 font-medium">利用者負担</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {details.map((d) => (
            <BillingDetailRow key={d.id} detail={d} onUpdated={handleUpdated} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold text-sm">
            <td className="py-2 pr-3">合計</td>
            <td className="text-right py-2 px-3">{totalDays}日</td>
            <td className="text-right py-2 px-3">{totalUnits.toLocaleString()}</td>
            <td className="text-right py-2 px-3">—</td>
            <td className="text-right py-2 px-3 text-indigo-600">{totalBilled.toLocaleString()}円</td>
            <td className="text-right py-2 pl-3 text-orange-600">{totalCopay.toLocaleString()}円</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
