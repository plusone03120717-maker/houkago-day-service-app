import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { buildMonthInvoices } from '@/lib/billing/copay-invoice'
import { InvoiceMonthView } from '@/components/billing/invoice-month-view'

export const dynamic = 'force-dynamic'

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ unit?: string }>
}) {
  const { yearMonth } = await params
  const { unit: unitParam } = await searchParams
  const supabase = await createClient()

  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  const { data: unitsRaw } = await supabase.from('units').select('id, name').order('name')
  const units = (unitsRaw ?? []) as Array<{ id: string; name: string }>
  const unitId = unitParam ?? units[0]?.id ?? null

  if (!unitId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">利用者負担額</h1>
        <p className="text-sm text-gray-500">ユニットが登録されていません。</p>
      </div>
    )
  }

  const result = await buildMonthInvoices(supabase, unitId, yearMonth)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/billing/${yearMonth}`} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {year}年{month}月 利用者負担額
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            給付費の1割・日中一時支援・活動プログラム・実費をまとめて請求書／領収書にします
          </p>
        </div>
      </div>

      {units.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/billing/${yearMonth}/invoices?unit=${u.id}`}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                u.id === unitId
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      {result.fatal ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {result.fatal}
        </div>
      ) : (
        <InvoiceMonthView
          unitId={result.unitId}
          unitName={result.unitName}
          yearMonth={yearMonth}
          invoices={result.children}
        />
      )}

      <p className="text-xs text-gray-400">
        単位数単価 {result.unitPrice}円 / 日中一時の送迎費 片道{result.daytimeTransportFee}円（
        <Link href="/settings/daytime-rates" className="text-indigo-600 hover:underline">
          設定を変更
        </Link>
        ）
      </p>
    </div>
  )
}
