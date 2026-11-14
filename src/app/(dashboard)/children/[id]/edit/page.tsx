import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Car } from 'lucide-react'
import { ChildForm } from '@/components/children/child-form'
import type { School, PhoneEntry } from '@/components/children/child-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChildTransportSummary } from '@/components/children/child-transport-summary'
import { DeleteChildButton } from '@/components/children/delete-child-button'
import { getStaffAccess } from '@/lib/require-admin'

type Unit = { id: string; name: string; service_type: string }
type ChildUnit = { unit_id: string }

type Child = {
  id: string
  name: string
  name_kana: string | null
  birth_date: string
  gender: string
  postal_code: string | null
  address: string | null
  school_id: string | null
  school_name: string | null
  grade: string | null
  disability_type: string | null
  daytime_support_category: number | null
  withdrawal_fee_enabled: boolean | null
  diagnosis: string | null
  allergy_info: string | null
  medical_info: string | null
  notes: string | null
  service_type: string | null
  childcare_type: string | null
  children_units: ChildUnit[]
}

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: childRaw }, { data: unitsRaw }, { data: schoolsRaw }, { data: addressesRaw }, { data: phonesRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, gender, postal_code, address, school_id, school_name, grade, disability_type, daytime_support_category, withdrawal_fee_enabled, diagnosis, allergy_info, medical_info, notes, service_type, childcare_type, children_units(unit_id)')
      .eq('id', id)
      .single(),
    supabase.from('units').select('id, name, service_type').order('name'),
    supabase.from('schools').select('id, municipality, name, address, facility_type').order('municipality').order('name'),
    supabase
      .from('child_addresses')
      .select('id, label, postal_code, address, is_default')
      .eq('child_id', id)
      .order('sort_order'),
    supabase
      .from('child_phone_numbers')
      .select('id, label, phone_number')
      .eq('child_id', id)
      .order('sort_order'),
  ])

  if (!childRaw) notFound()
  const child = childRaw as unknown as Child
  const units = (unitsRaw ?? []) as unknown as Unit[]
  const schools = (schoolsRaw ?? []) as unknown as School[]
  const initialAddresses = (addressesRaw ?? []) as unknown as { id: string; label: string; postal_code: string | null; address: string; is_default: boolean }[]
  const initialPhones = (phonesRaw ?? []) as unknown as PhoneEntry[]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name} の情報編集</h1>
          <p className="text-sm text-gray-500 mt-0.5">基本情報・所属ユニットを変更できます</p>
        </div>
      </div>

      <ChildForm
        units={units}
        schools={schools}
        initial={{
          id: child.id,
          name: child.name,
          name_kana: child.name_kana ?? '',
          birth_date: child.birth_date,
          gender: child.gender,
          school_id: child.school_id ?? '',
          school_name: child.school_name ?? '',
          grade: child.grade ?? '',
          disability_type: child.disability_type ?? '',
          daytime_support_category: child.daytime_support_category != null ? String(child.daytime_support_category) : '',
          withdrawal_fee_enabled: child.withdrawal_fee_enabled !== false,
          diagnosis: child.diagnosis ?? '',
          allergy_info: child.allergy_info ?? '',
          medical_info: child.medical_info ?? '',
          notes: child.notes ?? '',
          unit_ids: child.children_units.map((cu) => cu.unit_id),
          service_type: (child.service_type as 'afterschool' | 'development_support' | 'other' | null) ?? '',
          childcare_type: (child.childcare_type as 'nursery' | 'other' | null) ?? '',
        }}
        initialAddresses={initialAddresses.map((a) => ({
          id: a.id,
          label: a.label,
          postal_code: a.postal_code ?? '',
          address: a.address,
          is_default: a.is_default,
        }))}
        initialPhones={initialPhones}
      />

      {/* 送迎設定 */}
      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-indigo-500" />
            送迎
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChildTransportSummary childId={id} />
        </CardContent>
      </Card>

      {/* 削除（システム管理者だけ。関係する記録もまとめて消え、取り消せないため） */}
      {((await getStaffAccess())?.canEditOperations ?? false) && (
        <div className="max-w-2xl pt-2 border-t border-gray-200">
          <DeleteChildButton childId={id} childName={child.name} />
        </div>
      )}
    </div>
  )
}
