import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/documents/print-button'
import { PdfSaveButton } from '@/components/documents/pdf-save-button'
import { PrintChildFilter, type PrintChildOption } from '@/components/documents/print-child-filter'
import { BillingChildMonthlyView } from '@/components/billing/billing-child-monthly-view'
import { childrenFileLabel, parseChildrenParam } from '@/lib/print-children'

export const dynamic = 'force-dynamic'

type ServiceItem = Parameters<typeof BillingChildMonthlyView>[0]['serviceItems'][number]

/**
 * 選んだ児童の「月次サービス実績」（国保連請求 → 児童別の月次表）を縦に並べて確認・PDF化する画面。
 * 1人 = A4横1枚。編集はできない（直すときは児童別の画面で行う）。
 */
export default async function BillingMonthlyPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearMonth: string }>
  searchParams: Promise<{ unit?: string; children?: string }>
}) {
  const { yearMonth } = await params
  const { unit: unitId, children: childrenParam } = await searchParams
  const selectedIds = parseChildrenParam(childrenParam)
  const year = yearMonth.slice(0, 4)
  const month = yearMonth.slice(4, 6)
  const dashedYearMonth = `${year}-${month}`
  const backHref = `/billing?year=${parseInt(year)}&month=${parseInt(month)}`

  if (!unitId) {
    return <p className="p-8 text-sm text-gray-500">ユニットが指定されていません。</p>
  }

  const supabase = await createClient()
  const monthStart = `${year}-${month}-01`
  const monthEnd = `${year}-${month}-${String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')}`

  const [{ data: unitRaw }, { data: membersRaw }, { data: itemsRaw }] = await Promise.all([
    supabase.from('units').select('id, name, facility_id, facilities(name)').eq('id', unitId).maybeSingle(),
    supabase.from('children_units').select('children(id, name, name_kana)').eq('unit_id', unitId),
    supabase
      .from('billing_service_items')
      .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('sort_order'),
  ])
  const unit = unitRaw as unknown as {
    id: string
    name: string
    facility_id: string | null
    facilities: { name: string } | null
  } | null
  if (!unit) {
    return <p className="p-8 text-sm text-red-600">ユニットが見つかりません。</p>
  }

  const members = ((membersRaw ?? []) as unknown as Array<{
    children: { id: string; name: string; name_kana: string | null } | null
  }>)
    .map((m) => m.children)
    .filter((c): c is { id: string; name: string; name_kana: string | null } => c != null)
    .sort((a, b) => (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja'))

  const options: PrintChildOption[] = members.map((c) => ({ id: c.id, name: c.name }))
  // 一覧で選んだ順ではなく、あいうえお順に並べる
  const targets = members.filter((c) => selectedIds.includes(c.id))

  const { data: certsRaw } = targets.length > 0
    ? await supabase
        .from('benefit_certificates')
        .select('child_id, certificate_number, max_days_per_month, copay_limit, municipality, start_date')
        .in('child_id', targets.map((c) => c.id))
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart)
        .order('start_date', { ascending: false })
    : { data: [] }
  const certByChild = new Map<string, {
    certificate_number: string
    max_days_per_month: number
    copay_limit: number
    municipality: string | null
  }>()
  for (const c of (certsRaw ?? []) as Array<{
    child_id: string
    certificate_number: string
    max_days_per_month: number
    copay_limit: number
    municipality: string | null
  }>) {
    if (!certByChild.has(c.child_id)) certByChild.set(c.child_id, c)
  }

  const serviceItems = (itemsRaw ?? []) as ServiceItem[]

  return (
    <div className="p-4 sm:p-8">
      <div className="print:hidden mb-5 max-w-5xl space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" />
          国保連請求へ戻る
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {year}年{month}月分 月次サービス実績（{unit.name}）
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {targets.length}名 / 1人ずつA4横1枚。確認用のため、ここでは修正できません（修正は児童別の画面で行ってください）
            </p>
          </div>
          {targets.length > 0 && (
            <div className="flex items-start gap-2">
              <PdfSaveButton
                pageSelector=".monthly-page"
                orientation="landscape"
                fileName={`月次実績_${yearMonth}_${childrenFileLabel(targets.map((c) => c.name))}.pdf`}
              />
              <PrintButton />
            </div>
          )}
        </div>
        <PrintChildFilter options={options} selectedIds={selectedIds} requireSelection />
        {targets.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            上の「対象者を選ぶ」から、確認したい児童を選んでください。
          </div>
        )}
      </div>

      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          .monthly-page { page-break-after: always; zoom: 0.85; }
          .monthly-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {/* 日付が31列並ぶので、画面が狭くても表の幅は保つ（PDFもこの幅で写す） */}
      <div className="space-y-8 print:space-y-0">
        {targets.map((child) => {
          const cert = certByChild.get(child.id) ?? null
          return (
            <div
              key={child.id}
              className="monthly-page w-[1120px] bg-white border border-gray-200 rounded-lg p-5 space-y-3 print:border-0 print:p-0 print:rounded-none"
            >
              <div className="flex items-end justify-between border-b border-gray-300 pb-2">
                <div>
                  <p className="text-xs text-gray-500">{year}年{month}月分 月次サービス実績</p>
                  <p className="text-lg font-bold text-gray-900">
                    {child.name}
                    {child.name_kana && <span className="ml-2 text-xs font-normal text-gray-500">{child.name_kana}</span>}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <p>受給者証番号: {cert?.certificate_number ?? '未登録'}{cert?.municipality ? ` ／ ${cert.municipality}` : ''}</p>
                  <p>{unit.facilities?.name ? `${unit.facilities.name} ` : ''}{unit.name}</p>
                </div>
              </div>
              <BillingChildMonthlyView
                childId={child.id}
                childName={child.name}
                unitId={unit.id}
                yearMonth={dashedYearMonth}
                serviceItems={serviceItems}
                certInfo={cert ? { ...cert, municipality: cert.municipality ?? undefined } : null}
                facilityId={unit.facility_id}
                readOnly
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
