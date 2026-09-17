import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/documents/print-button'
import {
  KokuhorenInvoiceDocument,
  type KokuhorenInvoiceData,
} from '@/components/documents/kokuhoren-invoice-document'
import {
  KokuhorenDetailDocument,
  type KokuhorenDetailData,
} from '@/components/documents/kokuhoren-detail-document'
import {
  computeKokuhorenBilling,
  groupByMunicipality,
  groupByServiceKind,
} from '@/lib/kokuhoren/build'
import { loadBillingChildren } from '@/lib/kokuhoren/load'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

export const dynamic = 'force-dynamic'

const REGION_LABEL: Record<string, string> = {
  '01': '一級地', '02': '二級地', '03': '三級地', '04': '四級地',
  '05': '五級地', '06': '六級地', '07': '七級地', '20': 'その他',
}

export default async function KokuhorenPrintPage({
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

  const [{ data: facilityRaw }, childrenInput] = await Promise.all([
    supabase
      .from('facilities')
      .select('name, facility_number, postal_code, address, phone')
      .eq('facility_number', scope.facilityNumber)
      .maybeSingle(),
    loadBillingChildren(supabase, scope),
  ])
  const facilityRow = facilityRaw as {
    name: string
    facility_number: string
    postal_code: string | null
    address: string | null
    phone: string | null
  } | null

  const { errors, warnings, children } = computeKokuhorenBilling(
    { facilityNumber: scope.facilityNumber, regionCode: scope.regionCode, unitPrice: scope.unitPrice },
    yearMonth,
    childrenInput,
  )

  const facility = {
    name: facilityRow?.name ?? '',
    facilityNumber: scope.facilityNumber,
    postalCode: facilityRow?.postal_code ?? null,
    address: facilityRow?.address ?? null,
    phone: facilityRow?.phone ?? null,
  }

  // 請求日はサービス提供月の翌月1日
  const claimYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year)
  const claimMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1
  const claimDate = `${claimYear}-${String(claimMonth).padStart(2, '0')}-01`

  const byMunicipality = [...groupByMunicipality(children)].sort((a, b) => a[0].localeCompare(b[0]))

  const invoices: KokuhorenInvoiceData[] = byMunicipality.map(([municipalityCode, group]) => ({
    yearMonth,
    municipalityCode,
    claimDate,
    facility,
    lines: [...groupByServiceKind(group)].map(([kind, kindGroup]) => ({
      kind,
      count: kindGroup.length,
      units: kindGroup.reduce((s, c) => s + c.totalUnits, 0),
      totalCost: kindGroup.reduce((s, c) => s + c.totalCost, 0),
      benefitAmount: kindGroup.reduce((s, c) => s + c.benefitAmount, 0),
      copayAmount: kindGroup.reduce((s, c) => s + c.decidedCopay, 0),
    })),
  }))

  const ordered = byMunicipality.flatMap(([, group]) =>
    [...group].sort((a, b) => a.certificateNumber.localeCompare(b.certificateNumber)),
  )
  const details: KokuhorenDetailData[] = ordered.map((child, i) => ({
    yearMonth,
    child,
    facility: {
      name: facility.name,
      facilityNumber: facility.facilityNumber,
      regionLabel: REGION_LABEL[scope.regionCode] ?? scope.regionCode,
    },
    upperLimitFacilityName: null,
    pageNo: i + 1,
    pageCount: ordered.length,
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
              {year}年{month}月分 障害児通所給付費 請求書・明細書
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              請求書 {invoices.length}枚（市町村ごと）＋ 明細書 {details.length}枚（児童ごと）
              / A4縦・1枚ずつ改ページされます
            </p>
          </div>
          <PrintButton />
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">出力前に直す必要がある項目が{errors.length}件あります</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-semibold">確認してください（{warnings.length}件）</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {children.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            この月の請求明細がありません。先に「出席実績から再集計」を実行してください。
          </div>
        )}
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          .kokuhoren-page { page-break-after: always; }
          .kokuhoren-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-8 print:space-y-0">
        {invoices.map((doc) => (
          <div
            key={`invoice-${doc.municipalityCode}`}
            className="kokuhoren-page bg-white border border-gray-200 rounded-lg p-6 print:border-0 print:p-0 print:rounded-none"
          >
            <KokuhorenInvoiceDocument data={doc} />
          </div>
        ))}
        {details.map((doc) => (
          <div
            key={`detail-${doc.child.certificateNumber}`}
            className="kokuhoren-page bg-white border border-gray-200 rounded-lg p-6 print:border-0 print:p-0 print:rounded-none"
          >
            <KokuhorenDetailDocument data={doc} />
          </div>
        ))}
      </div>
    </div>
  )
}
