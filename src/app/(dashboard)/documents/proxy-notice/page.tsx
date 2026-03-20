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
  children: {
    name: string
    name_kana: string | null
    address: string | null
    benefit_certificates: { certificate_number: string; municipality: string | null }[]
  } | null
  benefit_certificates: { copay_limit: number } | null
}

type BillingMonthly = {
  id: string
  unit_id: string
  billing_details: BillingDetail[]
  units: { name: string; service_type: string } | null
}

type Facility = {
  name: string
  facility_number: string | null
  address: string | null
  phone: string | null
  manager_name: string | null
}

type ActualCost = {
  child_id: string
  amount: number
}

export default async function ProxyNoticePage({
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
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)
  const selectedUnit = params.unit

  const [{ data: facilityRaw }, { data: billingRaw }, { data: actualCostsRaw }, { data: unitsRaw }] =
    await Promise.all([
      supabase
        .from('facilities')
        .select('name, facility_number, address, phone, manager_name')
        .limit(1)
        .single(),
      supabase
        .from('billing_monthly')
        .select(`
          id, unit_id,
          billing_details (
            id, child_id, total_days, total_units, unit_price, copay_amount, billed_amount,
            children (name, name_kana, address, benefit_certificates (certificate_number, municipality)),
            benefit_certificates (copay_limit)
          ),
          units (name, service_type)
        `)
        .eq('year_month', yearMonth),
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

  const actualCostMap = new Map<string, number>()
  for (const ac of (actualCostsRaw ?? []) as unknown as ActualCost[]) {
    actualCostMap.set(ac.child_id, (actualCostMap.get(ac.child_id) ?? 0) + ac.amount)
  }

  const filtered = selectedUnit
    ? billingMonthly.filter((b) => b.unit_id === selectedUnit)
    : billingMonthly

  // 児童ごとにデータを集約
  const childMap = new Map<string, {
    name: string
    name_kana: string | null
    address: string | null
    certificateNumber: string
    municipality: string | null
    totalDays: number
    billedAmount: number
    copayLimit: number
    copayAmount: number
    actualCost: number
    unitName: string
  }>()

  for (const bm of filtered) {
    for (const d of bm.billing_details) {
      const cert = Array.isArray(d.children?.benefit_certificates)
        ? d.children.benefit_certificates[0]
        : null
      const existing = childMap.get(d.child_id)
      if (existing) {
        existing.totalDays += d.total_days
        existing.billedAmount += d.billed_amount
        existing.copayAmount += d.copay_amount
      } else {
        childMap.set(d.child_id, {
          name: d.children?.name ?? '—',
          name_kana: d.children?.name_kana ?? null,
          address: d.children?.address ?? null,
          certificateNumber: cert?.certificate_number ?? '—',
          municipality: cert?.municipality ?? null,
          totalDays: d.total_days,
          billedAmount: d.billed_amount,
          copayLimit: d.benefit_certificates?.copay_limit ?? 0,
          copayAmount: d.copay_amount,
          actualCost: actualCostMap.get(d.child_id) ?? 0,
          unitName: bm.units?.name ?? '',
        })
      }
    }
  }

  const rows = [...childMap.entries()].sort(([, a], [, b]) =>
    (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja')
  )

  const issueDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
  const targetMonth = `${year}年${month}月`

  return (
    <div>
      {/* コントロール（印刷時非表示） */}
      <div className="print:hidden flex items-center justify-between mb-4 gap-3 flex-wrap">
        <Link href="/documents" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" />
          帳票一覧
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/documents/proxy-notice?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold">{year}年{month}月</span>
          <Link
            href={`/documents/proxy-notice?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/documents/proxy-notice?year=${year}&month=${month}`}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${!selectedUnit ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            全ユニット
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/documents/proxy-notice?year=${year}&month=${month}&unit=${u.id}`}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedUnit === u.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {u.name}
            </Link>
          ))}
        </div>
        <PrintButton />
      </div>

      {/* 印刷レイアウト — 児童1人につき1通 */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 print:hidden">
          <p>この月の請求データがありません</p>
          <p className="text-xs mt-2">請求データを作成してから出力してください</p>
        </div>
      ) : (
        <div className="space-y-12 print:space-y-0">
          {rows.map(([childId, row], idx) => {
            const totalCharge = row.copayAmount + row.actualCost
            return (
              <div
                key={childId}
                className="max-w-2xl mx-auto bg-white p-8 print:p-6 print:max-w-none print:break-after-page last:print:break-after-avoid"
              >
                {/* タイトル */}
                <div className="text-center mb-6">
                  <h1 className="text-lg font-bold tracking-wider">
                    障害福祉サービス等　代理受領通知書
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">（利用者保護者様控え）</p>
                </div>

                {/* 発行情報 */}
                <div className="flex justify-between text-sm mb-6">
                  <div>
                    <p className="font-semibold text-base">{row.name} 様</p>
                    {row.address && <p className="text-xs text-gray-500 mt-0.5">{row.address}</p>}
                  </div>
                  <div className="text-right text-xs text-gray-600 space-y-0.5">
                    <p>発行日: {issueDate}</p>
                    <p>対象月: {targetMonth}</p>
                    <p>受給者証番号: {row.certificateNumber}</p>
                    {row.municipality && <p>支給決定市町村: {row.municipality}</p>}
                  </div>
                </div>

                {/* 本文 */}
                <p className="text-sm mb-5 leading-relaxed">
                  {targetMonth}分の障害福祉サービス（放課後等デイサービス）について、
                  下記のとおり代理受領を行いましたのでお知らせします。
                </p>

                {/* 明細表 */}
                <table className="w-full border-collapse text-sm mb-5">
                  <tbody>
                    <tr>
                      <th className="border border-gray-400 bg-gray-50 px-3 py-2 text-left font-medium w-1/2">項目</th>
                      <th className="border border-gray-400 bg-gray-50 px-3 py-2 text-right font-medium">金額</th>
                    </tr>
                    <tr>
                      <td className="border border-gray-400 px-3 py-2">
                        <p>サービス費用（給付費相当額）</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          利用日数 {row.totalDays}日
                        </p>
                      </td>
                      <td className="border border-gray-400 px-3 py-2 text-right">
                        {row.billedAmount.toLocaleString()}円
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-400 px-3 py-2">
                        自治体からの給付費（代理受領額）
                      </td>
                      <td className="border border-gray-400 px-3 py-2 text-right text-indigo-700 font-medium">
                        {(row.billedAmount - row.copayAmount).toLocaleString()}円
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-400 px-3 py-2">
                        <p>利用者負担額</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          負担上限月額: {row.copayLimit.toLocaleString()}円
                        </p>
                      </td>
                      <td className="border border-gray-400 px-3 py-2 text-right">
                        {row.copayAmount.toLocaleString()}円
                      </td>
                    </tr>
                    {row.actualCost > 0 && (
                      <tr>
                        <td className="border border-gray-400 px-3 py-2">実費等（食費・材料費など）</td>
                        <td className="border border-gray-400 px-3 py-2 text-right">
                          {row.actualCost.toLocaleString()}円
                        </td>
                      </tr>
                    )}
                    <tr className="font-semibold">
                      <td className="border border-gray-400 bg-gray-50 px-3 py-2">
                        お支払い合計額
                      </td>
                      <td className="border border-gray-400 bg-gray-50 px-3 py-2 text-right text-lg">
                        {totalCharge.toLocaleString()}円
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 事業所情報 */}
                <div className="border border-gray-300 rounded p-3 text-xs text-gray-600 space-y-0.5">
                  <p className="font-semibold text-sm text-gray-800 mb-1">
                    {facility?.name ?? '事業所名'}
                  </p>
                  {facility?.facility_number && <p>事業所番号: {facility.facility_number}</p>}
                  {facility?.address && <p>所在地: {facility.address}</p>}
                  {facility?.phone && <p>電話: {facility.phone}</p>}
                  {facility?.manager_name && <p>管理者: {facility.manager_name}</p>}
                </div>

                <p className="text-xs text-gray-400 mt-4 text-center">
                  ご不明な点がございましたら、事業所までお問い合わせください。
                </p>

                {/* 通し番号（複数ページ印刷時の参考） */}
                <p className="text-xs text-gray-300 text-right mt-2 print:block hidden">
                  {idx + 1} / {rows.length}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
