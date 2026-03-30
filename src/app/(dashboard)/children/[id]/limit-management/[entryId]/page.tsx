import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { LimitManagementForm } from '@/components/children/limit-management-form'

export default async function EditLimitManagementPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>
}) {
  const { id, entryId } = await params
  const supabase = await createClient()

  const [{ data: child }, { data: entry }] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', id).single(),
    supabase
      .from('child_limit_management')
      .select('id, start_date, facility_name')
      .eq('id', entryId)
      .single(),
  ])

  if (!child || !entry) notFound()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">上限管理事業所を編集</h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      <LimitManagementForm
        childId={id}
        initial={{
          id: entry.id,
          start_date: entry.start_date,
          facility_name: entry.facility_name,
        }}
      />
    </div>
  )
}
