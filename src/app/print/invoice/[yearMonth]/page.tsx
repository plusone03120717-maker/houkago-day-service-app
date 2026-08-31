import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintOptions } from '@/components/documents/print-options'
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/documents/invoice-document'
import { buildMonthInvoices, type InvoiceLine } from '@/lib/billing/copay-invoice'

export const dynamic = 'force-dynamic'

type SavedInvoice = {
  id: string
  child_id: string
  lines: InvoiceLine[]
  total_amount: number
  total_cost: number
  copay_amount: number
  daytime_copay_amount: number
  issued_at: string | null
  paid_at: string | null
  receipt_no: string | null
  payment_method: string | null
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ unit?: string; children?: string; type?: string }>
}) {
  const { yearMonth } = await params
  const { unit: unitParam, children: childrenParam, type: typeParam } = await searchParams
  const type: 'invoice' | 'receipt' = typeParam === 'receipt' ? 'receipt' : 'invoice'
  const supabase = await createClient()

  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)

  // 対象ユニット（指定がなければ最初のユニット）
  const { data: unitsRaw } = await supabase.from('units').select('id, name, facility_id').order('name')
  const units = (unitsRaw ?? []) as Array<{ id: string; name: string; facility_id: string }>
  const unitId = unitParam ?? units[0]?.id ?? null

  if (!unitId) {
    return <p className="p-8 text-sm text-gray-500">ユニットが登録されていません。</p>
  }

  const [{ data: facilityRaw }, result] = await Promise.all([
    supabase
      .from('facilities')
      .select('id, name, facility_number, postal_code, address, phone')
      .eq('id', units.find((u) => u.id === unitId)?.facility_id ?? '')
      .maybeSingle(),
    buildMonthInvoices(supabase, unitId, yearMonth),
  ])
  const facilityRow = facilityRaw as {
    name: string
    facility_number: string
    postal_code: string | null
    address: string | null
    phone: string | null
  } | null
  const facility = {
    name: facilityRow?.name ?? '',
    facilityNumber: facilityRow?.facility_number ?? '',
    postalCode: facilityRow?.postal_code ?? null,
    address: facilityRow?.address ?? null,
    phone: facilityRow?.phone ?? null,
  }

  const selectedIds = childrenParam ? childrenParam.split(',').filter(Boolean) : null
  const targets = result.children.filter(
    (c) => (selectedIds ? selectedIds.includes(c.childId) : true) && c.total > 0,
  )

  const childIds = targets.map((c) => c.childId)
  const [{ data: savedRaw }, { data: certsRaw }] = await Promise.all([
    childIds.length > 0
      ? supabase
          .from('billing_invoices')
          .select(
            'id, child_id, lines, total_amount, total_cost, copay_amount, daytime_copay_amount, issued_at, paid_at, receipt_no, payment_method',
          )
          .eq('year_month', yearMonth)
          .eq('invoice_type', 'invoice')
          .in('child_id', childIds)
      : Promise.resolve({ data: [] }),
    childIds.length > 0
      ? supabase
          .from('benefit_certificates')
          .select('child_id, certificate_number, start_date, end_date')
          .in('child_id', childIds)
      : Promise.resolve({ data: [] }),
  ])
  const savedByChild = new Map(((savedRaw ?? []) as SavedInvoice[]).map((s) => [s.child_id, s]))
  const certByChild = new Map(
    ((certsRaw ?? []) as Array<{ child_id: string; certificate_number: string }>).map((c) => [
      c.child_id,
      c.certificate_number,
    ]),
  )

  // 発行済みならスナップショットを、未発行なら現時点の集計をそのまま印刷する
  const documents: InvoiceDocumentData[] = targets.map((child) => {
    const saved = savedByChild.get(child.childId) ?? null
    const lines = saved && Array.isArray(saved.lines) && saved.lines.length > 0 ? saved.lines : child.lines
    const total = saved?.total_amount ?? child.total
    const totalCost = saved?.total_cost ?? child.totalCost + child.daytimeCost
    const copay = (saved?.copay_amount ?? child.benefitCopay) + (saved?.daytime_copay_amount ?? child.daytimeCopay)
    return {
      childName: child.childName,
      certificateNumber: certByChild.get(child.childId) ?? null,
      yearMonth,
      lines,
      total,
      totalCost,
      benefitAmount: Math.max(0, totalCost - copay),
      issuedAt: saved?.issued_at ?? null,
      paidAt: saved?.paid_at ?? null,
      receiptNo: saved?.receipt_no ?? null,
      paymentMethod: saved?.payment_method ?? null,
      facility,
    }
  })

  const unissued = type === 'receipt' ? documents.filter((d) => !d.paidAt).length : 0

  return (
    <div className="p-4 sm:p-8">
      <div className="print:hidden mb-5 max-w-4xl mx-auto space-y-3">
        <Link
          href={`/billing/${yearMonth}/invoices?unit=${unitId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          利用者負担額の一覧へ戻る
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {year}年{month}月分 {type === 'receipt' ? '領収書' : '請求書'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {documents.length}名分 / 1名につきA4 1枚で印刷されます
          </p>
        </div>
        {unissued > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            入金日が未記録の児童が{unissued}名います。領収書の領収日欄が空欄のまま印刷されます。
          </div>
        )}
        {documents.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            対象の請求書がありません。
          </div>
        )}
        <PrintOptions />
      </div>

      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          .invoice-page { page-break-after: always; }
          .invoice-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-8 print:space-y-0">
        {documents.map((doc, i) => (
          <div
            key={`${doc.childName}-${i}`}
            className="invoice-page bg-white print:border-0 border border-gray-200 rounded-lg p-6 print:p-0 print:rounded-none"
          >
            <InvoiceDocument data={doc} type={type} />
          </div>
        ))}
      </div>
    </div>
  )
}
