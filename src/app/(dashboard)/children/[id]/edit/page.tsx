import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ChildForm } from '@/components/children/child-form'

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
  school_name: string | null
  grade: string | null
  disability_type: string | null
  diagnosis: string | null
  allergy_info: string | null
  medical_info: string | null
  notes: string | null
  children_units: ChildUnit[]
}

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: childRaw }, { data: unitsRaw }] = await Promise.all([
    supabase
      .from('children')
      .select('id, name, name_kana, birth_date, gender, postal_code, address, school_name, grade, disability_type, diagnosis, allergy_info, medical_info, notes, children_units(unit_id)')
      .eq('id', id)
      .single(),
    supabase.from('units').select('id, name, service_type').order('name'),
  ])

  if (!childRaw) notFound()
  const child = childRaw as unknown as Child
  const units = (unitsRaw ?? []) as unknown as Unit[]

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
        initial={{
          id: child.id,
          name: child.name,
          name_kana: child.name_kana ?? '',
          birth_date: child.birth_date,
          gender: child.gender,
          postal_code: child.postal_code ?? '',
          address: child.address ?? '',
          school_name: child.school_name ?? '',
          grade: child.grade ?? '',
          disability_type: child.disability_type ?? '',
          diagnosis: child.diagnosis ?? '',
          allergy_info: child.allergy_info ?? '',
          medical_info: child.medical_info ?? '',
          notes: child.notes ?? '',
          unit_ids: child.children_units.map((cu) => cu.unit_id),
        }}
      />
    </div>
  )
}
