import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import { ActivityProgramForm } from '@/components/settings/activity-program-form'

export default async function ActivityProgramsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: facility } = await supabase
    .from('facilities')
    .select('id')
    .single()

  const { data: programs } = await supabase
    .from('activity_programs')
    .select('id, name, category, extra_charge')
    .eq('facility_id', facility?.id ?? '')
    .order('category')
    .order('name')

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">活動プログラム管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">日々の記録で使用する活動プログラムを登録・管理します</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <ActivityProgramForm
          facilityId={facility?.id ?? ''}
          programs={programs ?? []}
        />
      </div>
    </div>
  )
}
