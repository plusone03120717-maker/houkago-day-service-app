import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ChildForm } from '@/components/children/child-form'

type Unit = { id: string; name: string; service_type: string }

export default async function NewChildPage() {
  const supabase = await createClient()

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/children" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">児童を登録</h1>
          <p className="text-sm text-gray-500 mt-0.5">新しい利用者情報を入力してください</p>
        </div>
      </div>

      <ChildForm units={units} />
    </div>
  )
}
