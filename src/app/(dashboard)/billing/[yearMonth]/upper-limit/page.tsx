import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpperLimitForm, type UpperLimitFormChild } from '@/components/billing/upper-limit-form'
import { KokuhorenExportButton } from '@/components/billing/kokuhoren-export-button'
import { computeKokuhorenBilling } from '@/lib/kokuhoren/build'
import { loadBillingChildren, loadUpperLimits } from '@/lib/kokuhoren/load'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'

export const dynamic = 'force-dynamic'

export default async function UpperLimitPage({
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

  const supabase = await createClient()

  // 起点の請求データ。指定がなければこの月の先頭を使う
  let targetId = billingMonthlyId ?? null
  if (!targetId) {
    const { data } = await supabase
      .from('billing_monthly')
      .select('id')
      .eq('year_month', yearMonth)
      .limit(1)
      .maybeSingle()
    targetId = data?.id ?? null
  }
  if (!targetId) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">
          この月の請求データがありません。先に「出席実績から再集計」を実行してください。
        </p>
      </div>
    )
  }

  const scope = await resolveBillingScope(supabase, targetId)
  if (scope.error) {
    return <div className="p-6"><p className="text-sm text-red-600">{scope.error}</p></div>
  }

  const [{ data: facilityRaw }, childrenInput] = await Promise.all([
    supabase.from('facilities').select('name').eq('facility_number', scope.facilityNumber).maybeSingle(),
    loadBillingChildren(supabase, scope),
  ])
  const facilityName = (facilityRaw as { name: string } | null)?.name ?? ''

  const { children } = computeKokuhorenBilling(
    { facilityNumber: scope.facilityNumber, regionCode: scope.regionCode, unitPrice: scope.unitPrice },
    yearMonth,
    childrenInput,
  )

  // 児童IDは billing_details 経由でしか分からないので受給者証番号で突き合わせる
  const { data: detailRows } = await supabase
    .from('billing_details')
    .select('child_id, children (id, benefit_certificates (certificate_number))')
    .in('billing_monthly_id', scope.billingMonthlyIds)

  type DetailRow = {
    child_id: string
    children: { id: string; benefit_certificates: Array<{ certificate_number: string }> } | null
  }
  const childIdByCert = new Map<string, string>()
  for (const r of (detailRows ?? []) as unknown as DetailRow[]) {
    for (const cert of r.children?.benefit_certificates ?? []) {
      childIdByCert.set(cert.certificate_number, r.child_id)
    }
  }

  const childIds = [...new Set([...childIdByCert.values()])]
  const saved = await loadUpperLimits(supabase, yearMonth, childIds)

  // 上限管理の対象になりうる児童: すでに記録がある、または受給者証に管理事業所の指定がある
  const { data: certRows } = await supabase
    .from('benefit_certificates')
    .select('child_id, certificate_number, is_upper_limit_manager, upper_limit_manager, upper_limit_manager_number')
    .in('child_id', childIds.length > 0 ? childIds : ['00000000-0000-0000-0000-000000000000'])

  type CertRow = {
    child_id: string
    certificate_number: string
    is_upper_limit_manager: boolean | null
    upper_limit_manager: string | null
    upper_limit_manager_number: string | null
  }
  const certByChild = new Map(
    ((certRows ?? []) as CertRow[]).map((c) => [c.child_id, c]),
  )

  const forms: UpperLimitFormChild[] = []
  for (const c of children) {
    const childId = childIdByCert.get(c.certificateNumber)
    if (!childId) continue
    const cert = certByChild.get(childId)
    const record = saved.get(childId)
    const isCandidate =
      record != null || cert?.is_upper_limit_manager === true || !!cert?.upper_limit_manager ||
      !!cert?.upper_limit_manager_number
    if (!isCandidate) continue

    forms.push({
      childId,
      childName: c.childName,
      certificateNumber: c.certificateNumber,
      copayLimit: c.copayLimit,
      selfTotalCost: c.totalCost,
      selfCopayAmount: c.capAdjusted,
      saved: record
        ? {
            managerOfficeNumber: record.managerOfficeNumber,
            isSelfManaged: record.isSelfManaged,
            result: record.result as '1' | '2' | '3',
            copayLimit: record.copayLimit,
            offices: record.offices,
          }
        : null,
    })
  }

  // 対象になりそうな児童が1人もいない場合でも、請求対象の全児童から追加できるようにする
  const others = children
    .filter((c) => {
      const childId = childIdByCert.get(c.certificateNumber)
      return childId != null && !forms.some((f) => f.childId === childId)
    })
    .map((c) => ({
      childId: childIdByCert.get(c.certificateNumber)!,
      childName: c.childName,
      certificateNumber: c.certificateNumber,
      copayLimit: c.copayLimit,
      selfTotalCost: c.totalCost,
      selfCopayAmount: c.capAdjusted,
      saved: null,
    })) as UpperLimitFormChild[]

  const selfManagedCount = forms.filter((f) => f.saved?.isSelfManaged).length

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      <div>
        <Link
          href={`/billing/${yearMonth}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          国保連請求へ戻る
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          {year}年{month}月分 利用者負担上限額管理
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          他事業所とFAXでやり取りした総費用額・利用者負担額をここに入力すると、明細書の上限額管理欄と
          上限額管理結果票に反映されます。
        </p>
      </div>

      {forms.length === 0 && others.length === 0 && (
        <p className="text-sm text-gray-500">この月の請求対象児童がいません。</p>
      )}

      {forms.length > 0 && (
        <div className="space-y-4">
          {forms.map((child) => (
            <UpperLimitForm
              key={child.childId}
              child={child}
              yearMonth={yearMonth}
              facilityNumber={scope.facilityNumber}
              facilityName={facilityName}
            />
          ))}
        </div>
      )}

      {selfManagedCount > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            上限額管理結果票（当事業所が管理事業所: {selfManagedCount}名）
          </p>
          <KokuhorenExportButton billingMonthlyId={targetId} kind="upper_limit" />
          <Link
            href={`/print/upper-limit/${yearMonth}?billing=${targetId}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            上限額管理結果票を印刷
          </Link>
          <p className="text-xs text-gray-400">
            印刷した結果票をJFAXで各事業所へ送ります。CSVは取込送信ソフトへ取り込んでください。
          </p>
        </div>
      )}

      {others.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="text-sm font-semibold text-gray-700 cursor-pointer">
            上限額管理を新しく登録する（他 {others.length}名）
          </summary>
          <div className="space-y-4 mt-4">
            {others.map((child) => (
              <UpperLimitForm
                key={child.childId}
                child={child}
                yearMonth={yearMonth}
                facilityNumber={scope.facilityNumber}
                facilityName={facilityName}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
