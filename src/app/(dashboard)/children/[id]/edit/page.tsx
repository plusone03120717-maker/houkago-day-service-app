import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Car } from 'lucide-react'
import { ChildForm } from '@/components/children/child-form'
import type { School } from '@/components/children/child-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChildTransportSettingsForm } from '@/components/children/child-transport-settings-form'

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
  diagnosis: string | null
  allergy_info: string | null
  medical_info: string | null
  notes: string | null
  children_units: ChildUnit[]
}

type TransportSettings = {
  id: string
  transport_type: 'none' | 'pickup_only' | 'dropoff_only' | 'both'
  pickup_location_type: 'home' | 'school'
  dropoff_location_type: 'home' | 'school'
  notes: string | null
}

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: childRaw }, { data: unitsRaw }, { data: schoolsRaw }, { data: transportRaw }, { data: addressesRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, gender, postal_code, address, school_id, school_name, grade, disability_type, diagnosis, allergy_info, medical_info, notes, children_units(unit_id)')
      .eq('id', id)
      .single(),
    supabase.from('units').select('id, name, service_type').order('name'),
    supabase.from('schools').select('id, municipality, name, address').order('municipality').order('name'),
    supabase
      .from('child_transport_settings')
      .select('id, transport_type, pickup_location_type, dropoff_location_type, notes')
      .eq('child_id', id)
      .maybeSingle(),
    supabase
      .from('child_addresses')
      .select('id, label, postal_code, address, is_default')
      .eq('child_id', id)
      .order('sort_order'),
  ])

  if (!childRaw) notFound()
  const child = childRaw as unknown as Child
  const units = (unitsRaw ?? []) as unknown as Unit[]
  const schools = (schoolsRaw ?? []) as unknown as School[]
  const transportSettings = transportRaw as TransportSettings | null
  const initialAddresses = (addressesRaw ?? []) as unknown as { id: string; label: string; postal_code: string | null; address: string; is_default: boolean }[]

  const schoolAddress = child.school_id
    ? (schools.find((s) => s.id === child.school_id)?.address ?? null)
    : null

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
          diagnosis: child.diagnosis ?? '',
          allergy_info: child.allergy_info ?? '',
          medical_info: child.medical_info ?? '',
          notes: child.notes ?? '',
          unit_ids: child.children_units.map((cu) => cu.unit_id),
        }}
        initialAddresses={initialAddresses.map((a) => ({
          id: a.id,
          label: a.label,
          postal_code: a.postal_code ?? '',
          address: a.address,
          is_default: a.is_default,
        }))}
      />

      {/* 送迎設定 */}
      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-indigo-500" />
            送迎設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChildTransportSettingsForm
            childId={id}
            childAddress={child.address}
            schoolName={child.school_name}
            schoolAddress={schoolAddress}
            initial={
              transportSettings
                ? {
                    id: transportSettings.id,
                    transport_type: transportSettings.transport_type,
                    pickup_location_type: transportSettings.pickup_location_type,
                    dropoff_location_type: transportSettings.dropoff_location_type,
                    notes: transportSettings.notes ?? '',
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
