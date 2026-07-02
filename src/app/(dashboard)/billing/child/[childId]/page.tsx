export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BillingChildMonthlyView } from '@/components/billing/billing-child-monthly-view'

type ServiceItem = {
  id: string
  unit_id: string
  name: string
  category: '基本' | '加算' | '保険外'
  trigger_field: 'basic' | 'transport_pickup' | 'transport_dropoff' | 'daytime_support' | 'manual'
  billing_code: string | null
  is_active: boolean
  sort_order: number
}

export default async function BillingChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>
  searchParams: Promise<{ month?: string; unit?: string }>
}) {
  const { childId } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const yearMonth = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 子ども情報
  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name, name_kana, birth_date')
    .eq('id', childId)
    .single()

  if (!childRaw) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>児童が見つかりません</p>
        <Link href="/billing" className="mt-3 inline-block text-indigo-600 hover:underline text-sm">
          国保連請求に戻る
        </Link>
      </div>
    )
  }

  // 所属ユニット
  const { data: unitsRaw } = await supabase
    .from('children_units')
    .select('units(id, name, service_type, facilities(id, name, facility_number))')
    .eq('child_id', childId)
  const units = (unitsRaw ?? []).map((r: unknown) => (r as { units: unknown }).units).filter(Boolean) as {
    id: string; name: string; service_type: string
    facilities: { id: string; name: string; facility_number: string } | null
  }[]

  const selectedUnitId = sp.unit ?? units[0]?.id ?? ''
  const facilityId = units.find((u) => u.id === selectedUnitId)?.facilities?.id
    ?? units[0]?.facilities?.id
    ?? null

  // 受給者証情報
  const { data: certRaw } = await supabase
    .from('benefit_certificates')
    .select('certificate_number, max_days_per_month, copay_limit, municipality')
    .eq('child_id', childId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // サービス項目マスタ
  const { data: serviceItemsRaw } = selectedUnitId
    ? await supabase
        .from('billing_service_items')
        .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
        .eq('unit_id', selectedUnitId)
        .eq('is_active', true)
        .order('sort_order')
    : { data: [] }
  const serviceItems = (serviceItemsRaw ?? []) as ServiceItem[]

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link href="/billing" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{childRaw.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {certRaw?.certificate_number ? `受給者番号: ${certRaw.certificate_number}` : '受給者番号未登録'}
            {certRaw?.municipality ? ` ／ ${certRaw.municipality}` : ''}
          </p>
        </div>
      </div>

      {/* ユニット選択 */}
      {units.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/billing/child/${childId}?month=${yearMonth}&unit=${u.id}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                u.id === selectedUnitId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      {selectedUnitId ? (
        <BillingChildMonthlyView
          childId={childId}
          childName={childRaw.name}
          unitId={selectedUnitId}
          yearMonth={yearMonth}
          serviceItems={serviceItems}
          certInfo={certRaw ?? null}
          facilityId={facilityId}
        />
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">ユニットが登録されていません</p>
      )}
    </div>
  )
}
