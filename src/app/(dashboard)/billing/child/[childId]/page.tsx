export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BillingChildMonthlyView } from '@/components/billing/billing-child-monthly-view'
import { BillingConfirmToggle } from '@/components/billing/billing-confirm-toggle'

type ServiceItem = {
  id: string
  unit_id: string
  name: string
  category: '基本' | '加算' | '保険外'
  trigger_field: 'basic' | 'transport_pickup' | 'transport_dropoff' | 'daytime_support' | 'daytime_pickup' | 'daytime_dropoff' | 'absent' | 'extension' | 'manual'
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

  // 児童情報・所属ユニット・受給者証はいずれも childId だけで引けるので並列取得
  // （以前は3本を直列に await していた）
  const [{ data: childRaw }, { data: unitsRaw }, { data: certRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date')
      .eq('id', childId)
      .single(),
    supabase
      .from('children_units')
      .select('units(id, name, service_type, facilities(id, name, facility_number))')
      .eq('child_id', childId),
    supabase
      .from('benefit_certificates')
      .select('certificate_number, max_days_per_month, copay_limit, municipality')
      .eq('child_id', childId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

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

  const units = (unitsRaw ?? []).map((r: unknown) => (r as { units: unknown }).units).filter(Boolean) as {
    id: string; name: string; service_type: string
    facilities: { id: string; name: string; facility_number: string } | null
  }[]

  const selectedUnitId = sp.unit ?? units[0]?.id ?? ''
  const facilityId = units.find((u) => u.id === selectedUnitId)?.facilities?.id
    ?? units[0]?.facilities?.id
    ?? null

  // 月次請求の参照とサービス項目マスタは互いに独立しているため並列取得
  const yearMonthCompact = yearMonth.replace('-', '')
  const [monthlyLookup, serviceItemsLookup] = await Promise.all([
    selectedUnitId
      ? supabase
          .from('billing_monthly')
          .select('id')
          .eq('unit_id', selectedUnitId)
          .eq('year_month', yearMonthCompact)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    selectedUnitId
      ? supabase
          .from('billing_service_items')
          .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
          .eq('unit_id', selectedUnitId)
          .eq('is_active', true)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  // billing_monthly を自動作成（なければ insert）
  let billingMonthlyId: string | null = null
  if (selectedUnitId) {
    const existingMonthly = monthlyLookup.data as { id: string } | null
    if (existingMonthly) {
      billingMonthlyId = existingMonthly.id
    } else {
      const { data: newMonthly } = await supabase
        .from('billing_monthly')
        .insert({ unit_id: selectedUnitId, year_month: yearMonthCompact, status: 'draft' })
        .select('id')
        .maybeSingle()
      billingMonthlyId = newMonthly?.id ?? null
    }
  }

  // billing_details を自動作成（なければ insert、あれば既存を使用）
  let billingDetail: { id: string; is_confirmed: boolean } | null = null
  if (billingMonthlyId) {
    const { data: existingDetail } = await supabase
      .from('billing_details')
      .select('id, is_confirmed')
      .eq('billing_monthly_id', billingMonthlyId)
      .eq('child_id', childId)
      .maybeSingle()
    if (existingDetail) {
      billingDetail = existingDetail as { id: string; is_confirmed: boolean }
    } else {
      const { data: newDetail } = await supabase
        .from('billing_details')
        .insert({
          billing_monthly_id: billingMonthlyId,
          child_id: childId,
          total_days: 0,
          total_units: 0,
          copay_amount: 0,
          billed_amount: 0,
          // 単位数・サービスコードは「出席実績から再集計」で埋まる
          service_code: null,
          errors: [],
        })
        .select('id, is_confirmed')
        .maybeSingle()
      billingDetail = newDetail as { id: string; is_confirmed: boolean } | null
    }
  }

  // サービス項目マスタ（上の Promise.all で取得済み）
  let serviceItems = (serviceItemsLookup.data ?? []) as ServiceItem[]

  // 各種加算がなければ自動挿入
  if (selectedUnitId && serviceItems.length > 0) {
    const toInsert: Omit<ServiceItem, 'id'>[] = []
    let maxOrder = Math.max(...serviceItems.map((i) => i.sort_order), 0)
    const hasDaytimeSupportItem = serviceItems.some((i) => i.trigger_field === 'daytime_support')
    if (hasDaytimeSupportItem && !serviceItems.some((i) => i.trigger_field === 'daytime_pickup')) {
      toInsert.push({ unit_id: selectedUnitId, name: '日中一時支援・送迎加算（往）', category: '加算', trigger_field: 'daytime_pickup', billing_code: null, is_active: true, sort_order: ++maxOrder })
    }
    if (hasDaytimeSupportItem && !serviceItems.some((i) => i.trigger_field === 'daytime_dropoff')) {
      toInsert.push({ unit_id: selectedUnitId, name: '日中一時支援・送迎加算（復）', category: '加算', trigger_field: 'daytime_dropoff', billing_code: null, is_active: true, sort_order: ++maxOrder })
    }
    if (!serviceItems.some((i) => i.trigger_field === 'absent')) {
      toInsert.push({ unit_id: selectedUnitId, name: '欠席時対応加算', category: '加算', trigger_field: 'absent', billing_code: null, is_active: true, sort_order: ++maxOrder })
    }
    if (!serviceItems.some((i) => i.trigger_field === 'extension')) {
      toInsert.push({ unit_id: selectedUnitId, name: '延長加算', category: '加算', trigger_field: 'extension', billing_code: null, is_active: true, sort_order: ++maxOrder })
    }
    if (toInsert.length > 0) {
      const { data: inserted } = await supabase
        .from('billing_service_items')
        .insert(toInsert)
        .select('id, unit_id, name, category, trigger_field, billing_code, is_active, sort_order')
      if (inserted) serviceItems = [...serviceItems, ...(inserted as ServiceItem[])]
    }
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link href="/billing" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">{childRaw.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {certRaw?.certificate_number ? `受給者番号: ${certRaw.certificate_number}` : '受給者番号未登録'}
            {certRaw?.municipality ? ` ／ ${certRaw.municipality}` : ''}
          </p>
        </div>
        {billingDetail ? (
          <BillingConfirmToggle
            billingDetailId={billingDetail.id}
            initialConfirmed={billingDetail.is_confirmed}
          />
        ) : (
          <span className="text-xs text-gray-400">請求データ未作成</span>
        )}
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
