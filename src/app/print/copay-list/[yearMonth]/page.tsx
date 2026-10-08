import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/documents/print-button'
import { PdfSaveButton } from '@/components/documents/pdf-save-button'
import { PrintChildFilter, type PrintChildOption } from '@/components/documents/print-child-filter'
import { childrenFileLabel, parseChildrenParam } from '@/lib/print-children'
import { COPAY_LIST_ROWS, CopayListDocument } from '@/components/documents/copay-list-document'
import { loadCopayList } from '@/lib/kokuhoren/copay-list'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

export const dynamic = 'force-dynamic'

export default async function CopayListPrintPage({
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

  const { facility, groups: allGroups } = await loadCopayList(supabase, scope)

  const childOptions: PrintChildOption[] = allGroups
    .flatMap((g) => g.children)
    .map((c) => ({ id: c.childId, name: c.childName }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const groups = filtered
    ? allGroups
        .map((g) => ({ ...g, children: g.children.filter((c) => selectedIds.includes(c.childId)) }))
        .filter((g) => g.children.length > 0)
    : allGroups

  // 提供先ごとに、1枚10名ずつに分ける
  const pages = groups.flatMap((g) => {
    const out = []
    for (let i = 0; i < g.children.length; i += COPAY_LIST_ROWS) {
      out.push({ ...g, children: g.children.slice(i, i + COPAY_LIST_ROWS) })
    }
    return out
  })

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
              {year}年{month}月分 利用者負担額一覧表
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pages.length}枚（上限額管理事業所ごと{filtered ? '・選んだ児童のみ' : ''}）/ A4縦・1枚ずつ改ページされます
            </p>
          </div>
          <div className="flex items-start gap-2">
            {pages.length > 0 && (
              <PdfSaveButton
                pageSelector=".copay-list-page"
                fileName={
                  filtered
                    ? `利用者負担額一覧表_${yearMonth}_${childrenFileLabel(groups.flatMap((g) => g.children.map((c) => c.childName)))}.pdf`
                    : `利用者負担額一覧表_${yearMonth}.pdf`
                }
              />
            )}
            <PrintButton />
          </div>
        </div>
        <PrintChildFilter options={childOptions} selectedIds={selectedIds} />
        {pages.length === 0 && !filtered && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            他事業所が上限額管理事業所になっている児童がこの月にはいません。
            児童詳細の「上限管理事業所情報」か受給者証の「上限管理事業所名」に他事業所名を入れると、ここに載ります。
          </div>
        )}
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .copay-list-page { page-break-after: always; }
          .copay-list-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-8 print:space-y-0">
        {pages.map((p, i) => (
          <div
            key={`${p.managerNumber || p.managerName}-${i}`}
            className="copay-list-page bg-white border border-gray-200 rounded-lg p-6 print:border-0 print:p-0 print:rounded-none"
          >
            <CopayListDocument
              data={{
                yearMonth,
                managerName: p.managerName,
                managerNumber: p.managerNumber,
                children: p.children,
                facility,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
