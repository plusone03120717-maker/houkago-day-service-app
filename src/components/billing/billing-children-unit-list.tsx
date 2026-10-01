'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, FileText, ClipboardList } from 'lucide-react'
import { BillingConfirmToggle } from '@/components/billing/billing-confirm-toggle'

export type BillingChildRow = {
  id: string
  name: string
  name_kana: string | null
  upperLimitManager: string | null
  detail: { id: string; is_confirmed: boolean } | null
}

/**
 * 国保連請求「児童別」タブのユニット1つ分の一覧。
 * チェックを入れた児童だけの月次実績・明細書・実績記録票をまとめて開ける。
 */
export function BillingChildrenUnitList({
  unitId,
  yearMonth,
  billingMonthlyId,
  rows,
}: {
  unitId: string
  /** YYYYMM */
  yearMonth: string
  /** この月の請求データ（未作成なら null。明細書・実績記録票はこれがないと開けない） */
  billingMonthlyId: string | null
  rows: BillingChildRow[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const effYearMonth = `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`
  const allSelected = selected.length > 0 && selected.length === rows.length
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const ids = selected.join(',')
  const linkCls =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-indigo-200 bg-white text-xs font-medium text-indigo-700 hover:bg-indigo-50'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
            className="h-4 w-4 accent-indigo-600"
          />
          {selected.length > 0 ? `${selected.length}名を選択中` : 'まとめて確認する児童を選ぶ'}
        </label>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 ml-auto">
            <Link
              href={`/print/billing-monthly/${yearMonth}?unit=${unitId}&children=${ids}`}
              target="_blank"
              className={linkCls}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              月次実績をまとめて見る
            </Link>
            {billingMonthlyId && (
              <>
                <Link
                  href={`/print/kokuhoren/${yearMonth}?billing=${billingMonthlyId}&children=${ids}`}
                  target="_blank"
                  className={linkCls}
                >
                  <FileText className="h-3.5 w-3.5" />
                  明細書
                </Link>
                <Link
                  href={`/print/service-record/${yearMonth}?billing=${billingMonthlyId}&children=${ids}`}
                  target="_blank"
                  className={linkCls}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  実績記録票
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((child) => {
          const href = `/billing/child/${child.id}?month=${effYearMonth}&unit=${unitId}`
          return (
            <div key={child.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={selected.includes(child.id)}
                onChange={() => toggle(child.id)}
                aria-label={`${child.name}を選択`}
                className="h-4 w-4 mr-3 flex-shrink-0 accent-indigo-600"
              />
              <Link href={href} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold flex-shrink-0">
                  {child.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{child.name}</p>
                  {child.name_kana && <p className="text-xs text-gray-400">{child.name_kana}</p>}
                  {child.upperLimitManager && (
                    <p className="text-xs text-indigo-600 mt-0.5">上限管理: {child.upperLimitManager}</p>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {child.detail ? (
                  <BillingConfirmToggle billingDetailId={child.detail.id} initialConfirmed={child.detail.is_confirmed} />
                ) : (
                  <span className="text-xs text-gray-400">未作成</span>
                )}
                <Link href={href} className="text-xs text-indigo-600 font-medium whitespace-nowrap">
                  明細を見る →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
