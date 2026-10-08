import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UpperLimitForm, type UpperLimitFormChild } from '@/components/billing/upper-limit-form'
import { KokuhorenExportButton } from '@/components/billing/kokuhoren-export-button'
import { computeKokuhorenBilling } from '@/lib/kokuhoren/build'
import { loadBillingChildren, loadUpperLimits } from '@/lib/kokuhoren/load'
import { resolveBillingScope } from '@/lib/kokuhoren/scope'
import { resolveUpperLimitTargets } from '@/lib/kokuhoren/upper-limit-targets'

export const dynamic = 'force-dynamic'

function shiftMonth(yearMonth: string, delta: number): string {
  const d = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(4, 6)) - 1 + delta, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

  const header = (
    <div>
      <Link
        href={`/billing/${yearMonth}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        国保連請求へ
      </Link>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Link
          href={`/billing/${shiftMonth(yearMonth, -1)}/upper-limit`}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="前の月"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {year}年{parseInt(month)}月分 上限管理
        </h1>
        <Link
          href={`/billing/${shiftMonth(yearMonth, 1)}/upper-limit`}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="次の月"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )

  // 起点の請求データ。指定がなければこの月の先頭を使う
  let targetId = billingMonthlyId ?? null
  if (!targetId) {
    const { data } = await supabase
      .from('billing_monthly')
      .select('id, units!inner (is_billing_target)')
      .eq('year_month', yearMonth)
      .eq('units.is_billing_target', true)
      .limit(1)
      .maybeSingle()
    targetId = (data as { id: string } | null)?.id ?? null
  }
  if (!targetId) {
    return (
      <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
        {header}
        <p className="text-sm text-gray-500">
          この月の請求データがありません。先に
          <Link href={`/billing/${yearMonth}`} className="text-indigo-600 hover:underline mx-1">
            国保連請求
          </Link>
          で「出席実績から再集計」を実行してください。
        </p>
      </div>
    )
  }

  const scope = await resolveBillingScope(supabase, targetId)
  if (scope.error) {
    return (
      <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
        {header}
        <p className="text-sm text-red-600">{scope.error}</p>
      </div>
    )
  }

  const [{ data: facilityRaw }, childrenInput] = await Promise.all([
    supabase.from('facilities').select('name').eq('facility_number', scope.facilityNumber).maybeSingle(),
    loadBillingChildren(supabase, scope),
  ])
  const facility = {
    name: (facilityRaw as { name: string } | null)?.name ?? '',
    facilityNumber: scope.facilityNumber,
  }

  const { children } = computeKokuhorenBilling(
    { facilityNumber: scope.facilityNumber, regionCode: scope.regionCode, unitPrice: scope.unitPrice },
    yearMonth,
    childrenInput,
  )

  const childIds = [...new Set(children.map((c) => c.childId).filter(Boolean) as string[])]
  const [saved, targets] = await Promise.all([
    loadUpperLimits(supabase, yearMonth, childIds),
    resolveUpperLimitTargets(supabase, yearMonth, childIds, facility),
  ])

  const selfForms: UpperLimitFormChild[] = []
  const otherGroups = new Map<string, { managerName: string; managerNumber: string; children: UpperLimitFormChild[] }>()
  const others: UpperLimitFormChild[] = []

  for (const c of [...children].sort((a, b) => a.childName.localeCompare(b.childName, 'ja'))) {
    if (!c.childId) continue
    const target = targets.get(c.childId)
    const record = saved.get(c.childId)
    const form: UpperLimitFormChild = {
      childId: c.childId,
      childName: c.childName,
      certificateNumber: c.certificateNumber,
      copayLimit: c.copayLimit,
      selfTotalCost: c.totalCost,
      selfCopayAmount: c.capAdjusted,
      isSelf: target?.isSelf ?? false,
      managerName: target?.managerName ?? '',
      managerNumber: target?.managerNumber ?? '',
      conflict: target?.conflict ?? null,
      saved: record
        ? {
            managerOfficeNumber: record.managerOfficeNumber,
            isSelfManaged: record.isSelfManaged,
            result: record.result as '1' | '2' | '3',
            copayLimit: record.copayLimit,
            offices: record.offices,
          }
        : null,
    }
    if (!target) {
      others.push(form)
    } else if (target.isSelf) {
      selfForms.push(form)
    } else {
      const key = target.managerNumber || target.managerName || '（事業所名未登録）'
      const g = otherGroups.get(key) ?? {
        managerName: target.managerName,
        managerNumber: target.managerNumber,
        children: [],
      }
      g.children.push(form)
      otherGroups.set(key, g)
    }
  }

  const groups = [...otherGroups.values()].sort((a, b) => a.managerName.localeCompare(b.managerName, 'ja'))
  const otherCount = groups.reduce((s, g) => s + g.children.length, 0)
  const waitingCount = groups.reduce((s, g) => s + g.children.filter((c) => !c.saved).length, 0)
  const selfSavedIds = selfForms.filter((f) => f.saved?.isSelfManaged).map((f) => f.childId)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div className="space-y-2">
        {header}
        <p className="text-sm text-gray-500">
          上限管理の対象児童（児童詳細の「上限管理事業所情報」または受給者証の「上限管理事業所」が入っている児童）が
          自動で表示されます。結果を入力すると、保護者への請求額と国保連請求の利用者負担額が入力した額に変わります。
        </p>
      </div>

      {/* ── 他事業所が上限管理事業所 ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            他の事業所が上限管理（{otherCount}名
            {waitingCount > 0 && <span className="text-amber-600">・結果待ち {waitingCount}名</span>}）
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ①「上限管理一覧表」をPDFにして管理事業所へFAX → ② 戻ってきた結果の「管理結果後の利用者負担額」を入力して保存
          </p>
        </div>
        {groups.length === 0 && (
          <p className="text-sm text-gray-400">この月は該当する児童がいません。</p>
        )}
        {groups.map((g) => (
          <div key={g.managerNumber || g.managerName} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900">
                {g.managerName || '（事業所名未登録）'}
                {g.managerNumber && <span className="ml-2 text-xs font-normal text-gray-500">{g.managerNumber}</span>}
                <span className="ml-2 text-xs font-normal text-gray-500">{g.children.length}名</span>
              </p>
              <Link
                href={`/print/copay-list/${yearMonth}?billing=${targetId}&children=${g.children.map((c) => c.childId).join(',')}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50"
              >
                <Printer className="h-3.5 w-3.5" />
                上限管理一覧表（PDF）
              </Link>
            </div>
            {g.children.map((child) => (
              <UpperLimitForm
                key={child.childId}
                child={child}
                yearMonth={yearMonth}
                facilityNumber={scope.facilityNumber}
                facilityName={facility.name}
              />
            ))}
          </div>
        ))}
        {groups.length > 1 && (
          <Link
            href={`/print/copay-list/${yearMonth}?billing=${targetId}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            <Printer className="h-3.5 w-3.5" />
            全事業所分の上限管理一覧表をまとめて開く
          </Link>
        )}
      </section>

      {/* ── 当事業所が上限管理事業所 ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {facility.name || '当事業所'}が上限管理（{selfForms.length}名）
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ① 他事業所から届いた上限管理一覧表の金額を内訳に入力 →「管理結果を自動計算」→ 保存 → ②「上限管理結果票」をPDFにして各事業所へFAX
          </p>
        </div>
        {selfForms.length === 0 && (
          <p className="text-sm text-gray-400">この月は該当する児童がいません。</p>
        )}
        {selfForms.map((child) => (
          <div key={child.childId} className="space-y-1.5">
            <UpperLimitForm
              child={child}
              yearMonth={yearMonth}
              facilityNumber={scope.facilityNumber}
              facilityName={facility.name}
            />
            {child.saved?.isSelfManaged && (
              <Link
                href={`/print/upper-limit/${yearMonth}?billing=${targetId}&children=${child.childId}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline ml-1"
              >
                <Printer className="h-3.5 w-3.5" />
                {child.childName}さんの上限管理結果票（PDF）
              </Link>
            )}
          </div>
        ))}
        {selfSavedIds.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">上限管理結果票（入力済み {selfSavedIds.length}名）</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/print/upper-limit/${yearMonth}?billing=${targetId}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Printer className="h-4 w-4" />
                全員分の上限管理結果票を開く（PDF保存・印刷）
              </Link>
            </div>
            <KokuhorenExportButton billingMonthlyId={targetId} kind="upper_limit" />
            <p className="text-xs text-gray-400">
              PDFは各事業所へFAXで送ります。CSVは国保連の取込送信ソフトへ取り込みます。
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">
        ※ 保護者向けの請求書をすでに発行している場合は、結果を入力したあと
        <Link href={`/billing/${yearMonth}/invoices`} className="text-indigo-600 hover:underline mx-1">請求書・領収書</Link>
        の画面で発行し直してください。
      </p>

      {others.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="text-sm font-semibold text-gray-700 cursor-pointer">
            上限管理の対象として登録されていない児童から追加する（{others.length}名）
          </summary>
          <p className="text-xs text-gray-500 mt-2">
            毎月対象になる児童は、児童詳細の「上限管理事業所情報」に登録しておくと自動で上に表示されます。
          </p>
          <div className="space-y-4 mt-4">
            {others.map((child) => (
              <UpperLimitForm
                key={child.childId}
                child={child}
                yearMonth={yearMonth}
                facilityNumber={scope.facilityNumber}
                facilityName={facility.name}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
