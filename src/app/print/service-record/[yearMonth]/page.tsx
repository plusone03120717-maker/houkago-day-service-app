import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/documents/print-button'
import {
  ServiceRecordDocument,
  type ServiceRecordDocumentData,
} from '@/components/documents/service-record-document'
import { aggregateUnitMonth } from '@/lib/billing/aggregate'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

export const dynamic = 'force-dynamic'

export default async function ServiceRecordPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ billing?: string }>
}) {
  const { yearMonth } = await params
  const { billing: billingMonthlyId } = await searchParams
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

  const [{ data: facilityRaw }, { data: unitRows }] = await Promise.all([
    supabase
      .from('facilities')
      .select('name, facility_number')
      .eq('facility_number', scope.facilityNumber)
      .maybeSingle(),
    supabase.from('units').select('id, service_type').in('id', scope.unitIds),
  ])
  const facilityRow = facilityRaw as { name: string; facility_number: string } | null
  const facility = {
    name: facilityRow?.name ?? '',
    facilityNumber: scope.facilityNumber,
  }
  const serviceTypeByUnit = new Map(
    ((unitRows ?? []) as Array<{ id: string; service_type: string }>).map((u) => [u.id, u.service_type]),
  )

  const monthEndDay = new Date(parseInt(year), parseInt(month), 0).getDate()
  const monthStart = `${year}-${month}-01`
  const monthEnd = `${year}-${month}-${String(monthEndDay).padStart(2, '0')}`

  const warnings: string[] = []
  const documents: Omit<ServiceRecordDocumentData, 'pageNo' | 'pageCount'>[] = []
  const childIds: string[] = []

  for (const unitId of scope.unitIds) {
    const result = await aggregateUnitMonth(supabase, unitId, yearMonth)
    if (result.fatal) continue
    warnings.push(...result.warnings)
    const serviceType = serviceTypeByUnit.get(unitId) === 'development_support'
      ? 'development_support'
      : 'afterschool'
    for (const c of result.children) {
      if (c.days.length === 0) continue
      childIds.push(c.childId)
      documents.push({
        yearMonth,
        serviceType,
        childName: c.childName,
        certificateNumber: c.certificateNumber ?? '',
        contractDays: null,
        facility,
        days: c.days,
      })
    }
  }

  // 契約支給量は受給者証から拾う（集計結果には含まれない）
  if (childIds.length > 0) {
    const { data: certsRaw } = await supabase
      .from('benefit_certificates')
      .select('certificate_number, contract_amount, max_days_per_month, start_date, end_date')
      .in('child_id', childIds)
      .lte('start_date', monthEnd)
      .gte('end_date', monthStart)
    const daysByCert = new Map(
      ((certsRaw ?? []) as Array<{
        certificate_number: string
        contract_amount: number | null
        max_days_per_month: number
      }>).map((c) => [c.certificate_number, c.contract_amount ?? c.max_days_per_month ?? null]),
    )
    for (const doc of documents) {
      doc.contractDays = daysByCert.get(doc.certificateNumber) ?? null
    }
  }

  documents.sort((a, b) => a.certificateNumber.localeCompare(b.certificateNumber))
  const pages: ServiceRecordDocumentData[] = documents.map((doc, i) => ({
    ...doc,
    pageNo: i + 1,
    pageCount: documents.length,
  }))

  return (
    <div className="p-4 sm:p-8">
      <div className="print:hidden mb-5 max-w-5xl mx-auto space-y-3">
        <Link
          href={`/billing/${yearMonth}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          国保連請求へ戻る
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {year}年{month}月分 サービス提供実績記録票
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pages.length}枚（児童ごと）/ A4縦・1枚ずつ改ページされます
            </p>
          </div>
          <PrintButton />
        </div>
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-semibold">確認してください（{warnings.length}件）</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {pages.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            この月の実績がありません。
          </div>
        )}
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          .record-page { page-break-after: always; }
          .record-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-8 print:space-y-0">
        {pages.map((doc) => (
          <div
            key={`${doc.certificateNumber}-${doc.pageNo}`}
            className="record-page bg-white border border-gray-200 rounded-lg p-6 print:border-0 print:p-0 print:rounded-none"
          >
            <ServiceRecordDocument data={doc} />
          </div>
        ))}
      </div>
    </div>
  )
}
