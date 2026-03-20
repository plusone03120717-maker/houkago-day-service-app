import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PrintButton } from '@/components/documents/print-button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type BillingDetail = {
  id: string
  child_id: string
  total_days: number
  total_units: number
  unit_price: number
  copay_amount: number
  billed_amount: number
  children: { name: string; name_kana: string | null } | null
  benefit_certificates: { copay_limit: number; copay_category: string | null } | null
}

type BillingMonthly = {
  id: string
  unit_id: string
  year_month: string
  billing_details: BillingDetail[]
  units: { name: string; service_type: string } | null
}

type Facility = {
  id: string
  name: string
  facility_number: string | null
  address: string | null
  manager_name: string | null
}

type ActualCost = {
  child_id: string
  amount: number
}

export default async function CopaymentListPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const yearMonth = `${year}${String(month).padStart(2, '0')}`

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const [{ data: facilityRaw }, { data: billingRaw }, { data: actualCostsRaw }, { data: unitsRaw }] =
    await Promise.all([
      supabase.from('facilities').select('id, name, facility_number, address, manager_name').limit(1).single(),
      supabase
        .from('billing_monthly')
        .select(`
          id, unit_id, year_month,
          billing_details (id, child_id, total_days, total_units, unit_price, copay_amount, billed_amount,
            children (name, name_kana),
            benefit_certificates (copay_limit, copay_category)
          ),
          units (name, service_type)
        `)
        .eq('year_month', yearMonth)
        .order('unit_id'),
      supabase
        .from('billing_actual_costs')
        .select('child_id, amount')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase.from('units').select('id, name').order('name'),
    ])

  const facility = facilityRaw as unknown as Facility | null
  const billingMonthly = (billingRaw ?? []) as unknown as BillingMonthly[]
  const units = (unitsRaw ?? []) as unknown as { id: string; name: string }[]

  // 実費の集計（child_idごと）
  const actualCostMap = new Map<string, number>()
  for (const ac of (actualCostsRaw ?? []) as unknown as ActualCost[]) {
    actualCostMap.set(ac.child_id, (actualCostMap.get(ac.child_id) ?? 0) + ac.amount)
  }

  // ユニット選択フィルタ
  const selectedUnit = params.unit
  const filtered = selectedUnit
    ? billingMonthly.filter((b) => b.unit_id === selectedUnit)
    : billingMonthly

  // 全billingDetailsをフラット化
  const allDetails: (BillingDetail & { unit: string })[] = filtered.flatMap((bm) =>
    bm.billing_details.map((d) => ({ ...d, unit: bm.units?.name ?? '' }))
  )

  // 重複child_idを統合（同一月に複数ユニット跨ぎ）
  const childMap = new Map<string, {
    name: string
    name_kana: string | null
    totalDays: number
    totalUnits: number
    unitPrice: number
    copayAmount: number
    billedAmount: number
    copayLimit: number
    copayCategory: string | null
    unit: string
    actualCost: number
  }>()

  for (const d of allDetails) {
    const existing = childMap.get(d.child_id)
    if (existing) {
      existing.totalDays += d.total_days
      existing.totalUnits += d.total_units
      existing.copayAmount += d.copay_amount
      existing.billedAmount += d.billed_amount
    } else {
      childMap.set(d.child_id, {
        name: d.children?.name ?? '—',
        name_kana: d.children?.name_kana ?? null,
        totalDays: d.total_days,
        totalUnits: d.total_units,
        unitPrice: d.unit_price,
        copayAmount: d.copay_amount,
        billedAmount: d.billed_amount,
        copayLimit: d.benefit_certificates?.copay_limit ?? 0,
        copayCategory: d.benefit_certificates?.copay_category ?? null,
        unit: d.unit,
        actualCost: actualCostMap.get(d.child_id) ?? 0,
      })
    }
  }

  const rows = [...childMap.values()].sort((a, b) =>
    (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  const totalDays = rows.reduce((s, r) => s + r.totalDays, 0)
  const totalCopay = rows.reduce((s, r) => s + r.copayAmount, 0)
  const totalActual = rows.reduce((s, r) => s + r.actualCost, 0)
  const totalBilled = rows.reduce((s, r) => s + r.billedAmount, 0)

  const copayCategories: Record<string, string> = {
    category1: '第1段階（生活保護）',
    category2: '第2段階（低所得）',
    category3: '第3段階',
    category4: '第4段階（一般）',
  }

  return (
    <div>
      {/* 印刷時非表示のコントロール */}
      <div className="print:hidden flex items-center justify-between mb-4 gap-3 flex-wrap">
        <Link href="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" />
          帳票一覧
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/documents/copayment-list?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold">{year}年{month}月</span>
          <Link
            href={`/documents/copayment-list?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {/* ユニット絞り込み */}
        <div className="flex items-center gap-2">
          <Link
            href={`/documents/copayment-list?year=${year}&month=${month}`}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${!selectedUnit ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            全ユニット
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/documents/copayment-list?year=${year}&month=${month}&unit=${u.id}`}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedUnit === u.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {u.name}
            </Link>
          ))}
        </div>
        <PrintButton />
      </div>

      {/* 印刷用レイアウト */}
      <div className="max-w-5xl mx-auto p-6 print:p-0 bg-white">
        {/* ヘッダー */}
        <div className="text-center mb-6 print:mb-4">
          <h1 className="text-xl font-bold">利用者負担額一覧表</h1>
          <p className="text-sm mt-1">{year}年{month}月分</p>
        </div>

        <div className="flex justify-between text-sm mb-4 print:mb-3">
          <div>
            <p>事業所名: <span className="font-semibold">{facility?.name ?? '—'}</span></p>
            {facility?.facility_number && (
              <p>事業所番号: {facility.facility_number}</p>
            )}
          </div>
          <div className="text-right">
            <p>作成日: {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 print:hidden">
            <p>この月の請求データがありません</p>
            <p className="text-xs mt-2">請求データを作成してから出力してください</p>
          </div>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 print:bg-gray-100">
                  <th className="border border-gray-400 px-2 py-1.5 text-center w-8">No.</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-left">利用者氏名</th>
                  {!selectedUnit && (
                    <th className="border border-gray-400 px-2 py-1.5 text-center">ユニット</th>
                  )}
                  <th className="border border-gray-400 px-2 py-1.5 text-center w-16">利用日数</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-center">負担上限月額</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">給付費請求額</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">利用者負担額</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">実費等</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">合計請求額</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-center w-16">確認</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 print:hover:bg-transparent">
                    <td className="border border-gray-400 px-2 py-1.5 text-center text-xs">{idx + 1}</td>
                    <td className="border border-gray-400 px-2 py-1.5">
                      <p className="font-medium">{row.name}</p>
                      {row.name_kana && (
                        <p className="text-xs text-gray-500">{row.name_kana}</p>
                      )}
                    </td>
                    {!selectedUnit && (
                      <td className="border border-gray-400 px-2 py-1.5 text-center text-xs">{row.unit}</td>
                    )}
                    <td className="border border-gray-400 px-2 py-1.5 text-center">{row.totalDays}日</td>
                    <td className="border border-gray-400 px-2 py-1.5 text-center text-xs">
                      <p>{row.copayLimit.toLocaleString()}円</p>
                      {row.copayCategory && (
                        <p className="text-gray-400 text-xs">{copayCategories[row.copayCategory] ?? row.copayCategory}</p>
                      )}
                    </td>
                    <td className="border border-gray-400 px-2 py-1.5 text-right">{row.billedAmount.toLocaleString()}円</td>
                    <td className="border border-gray-400 px-2 py-1.5 text-right font-medium text-indigo-700">
                      {row.copayAmount.toLocaleString()}円
                    </td>
                    <td className="border border-gray-400 px-2 py-1.5 text-right text-gray-600">
                      {row.actualCost > 0 ? `${row.actualCost.toLocaleString()}円` : '—'}
                    </td>
                    <td className="border border-gray-400 px-2 py-1.5 text-right font-semibold">
                      {(row.copayAmount + row.actualCost).toLocaleString()}円
                    </td>
                    <td className="border border-gray-400 px-2 py-1.5 text-center text-xs text-gray-300">□</td>
                  </tr>
                ))}
                {/* 合計行 */}
                <tr className="bg-gray-50 font-semibold print:bg-gray-50">
                  <td colSpan={selectedUnit ? 2 : 3} className="border border-gray-400 px-2 py-2 text-right">
                    合計 ({rows.length}名)
                  </td>
                  <td className="border border-gray-400 px-2 py-2 text-center">{totalDays}日</td>
                  <td className="border border-gray-400 px-2 py-2" />
                  <td className="border border-gray-400 px-2 py-2 text-right">{totalBilled.toLocaleString()}円</td>
                  <td className="border border-gray-400 px-2 py-2 text-right text-indigo-700">{totalCopay.toLocaleString()}円</td>
                  <td className="border border-gray-400 px-2 py-2 text-right">{totalActual > 0 ? `${totalActual.toLocaleString()}円` : '—'}</td>
                  <td className="border border-gray-400 px-2 py-2 text-right">{(totalCopay + totalActual).toLocaleString()}円</td>
                  <td className="border border-gray-400 px-2 py-2" />
                </tr>
              </tbody>
            </table>

            {/* 署名欄 */}
            <div className="mt-8 grid grid-cols-3 gap-8 print:mt-6">
              {['管理者', '担当者', '確認者'].map((role) => (
                <div key={role} className="text-sm">
                  <p className="text-xs text-gray-500 mb-1">{role}</p>
                  <div className="border-b border-gray-400 h-10" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
