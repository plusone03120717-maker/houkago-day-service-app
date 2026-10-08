import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/documents/print-button'
import { PdfSaveButton } from '@/components/documents/pdf-save-button'
import { PrintChildFilter, type PrintChildOption } from '@/components/documents/print-child-filter'
import { childrenFileLabel, parseChildrenParam } from '@/lib/print-children'
import { UpperLimitDocument } from '@/components/documents/upper-limit-document'
import { loadUpperLimitChildren } from '@/lib/kokuhoren/load'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

export const dynamic = 'force-dynamic'

export default async function UpperLimitPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ billing?: string; children?: string }>
}) {
  const { yearMonth } = await params
  const { billing: billingMonthlyId, children: childrenParam } = await searchParams
  const selectedIds = parseChildrenParam(childrenParam)
  const filtered = selectedIds.length > 0
  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  if (!billingMonthlyId) {
    return <p className="p-8 text-sm text-gray-500">請求データが指定されていません。</p>
  }

  const supabase = await createClient()
  const scope = await resolveBillingScope(supabase, billingMonthlyId)
  if (scope.error) {
    return <p className="p-8 text-sm text-red-600">{scope.error}</p>
  }

  const [{ data: facilityRaw }, allChildren] = await Promise.all([
    supabase.from('facilities').select('name').eq('facility_number', scope.facilityNumber).maybeSingle(),
    loadUpperLimitChildren(supabase, scope),
  ])
  const facility = {
    name: (facilityRaw as { name: string } | null)?.name ?? '',
    facilityNumber: scope.facilityNumber,
  }

  const childOptions: PrintChildOption[] = allChildren
    .filter((c) => c.childId)
    .map((c) => ({ id: c.childId!, name: c.childName }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const children = filtered
    ? allChildren.filter((c) => c.childId && selectedIds.includes(c.childId))
    : allChildren

  return (
    <div className="p-4 sm:p-8">
      <div className="print:hidden mb-5 max-w-4xl mx-auto space-y-3">
        <Link
          href={`/billing/${yearMonth}/upper-limit?billing=${billingMonthlyId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          上限管理へ戻る
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {year}年{month}月分 利用者負担上限額管理結果票
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {children.length}枚（児童ごと）/ A4縦・1枚ずつ改ページされます
            </p>
          </div>
          <div className="flex items-start gap-2">
            {children.length > 0 && (
              <PdfSaveButton
                pageSelector=".upper-limit-page"
                fileName={
                  filtered
                    ? `利用者負担上限額管理結果票_${yearMonth}_${childrenFileLabel(children.map((c) => c.childName))}.pdf`
                    : `利用者負担上限額管理結果票_${yearMonth}.pdf`
                }
              />
            )}
            <PrintButton />
          </div>
        </div>
        <PrintChildFilter options={childOptions} selectedIds={selectedIds} />
        {children.length === 0 && !filtered && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            当事業所が上限額管理事業所になっている児童で、上限管理の入力が済んでいる児童がこの月にはいません。
          </div>
        )}
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .upper-limit-page { page-break-after: always; }
          .upper-limit-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-8 print:space-y-0">
        {children.map((child) => (
          <div
            key={child.certificateNumber}
            className="upper-limit-page bg-white border border-gray-200 rounded-lg p-6 print:border-0 print:p-0 print:rounded-none"
          >
            <UpperLimitDocument data={{ yearMonth, child, facility }} />
          </div>
        ))}
      </div>
    </div>
  )
}
