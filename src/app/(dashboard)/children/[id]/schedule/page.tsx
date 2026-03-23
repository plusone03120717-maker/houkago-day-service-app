import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { ChildSchedulePlanner } from '@/components/children/child-schedule-planner'

export default async function ChildSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: childId } = await params
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name')
    .eq('id', childId)
    .single()

  if (!childRaw) notFound()
  const child = childRaw as { id: string; name: string }

  // 全ユニット（施設内）を取得
  type UnitRow = { id: string; name: string; service_type: string }
  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, service_type')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as UnitRow[]

  // 既存の利用計画
  const { data: plansRaw } = await supabase
    .from('usage_plans')
    .select('id, unit_id, day_of_week, start_date, end_date, is_active, units(name)')
    .eq('child_id', childId)
    .order('start_date', { ascending: false })

  type Plan = {
    id: string
    unit_id: string
    day_of_week: number[]
    start_date: string
    end_date: string | null
    is_active: boolean
    units: { name: string } | null
  }
  const plans = (plansRaw ?? []) as unknown as Plan[]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${childId}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-indigo-500" />
            利用スケジュール
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{child.name}</p>
        </div>
      </div>

      <ChildSchedulePlanner
        childId={childId}
        childName={child.name}
        units={units}
        initialPlans={plans}
      />
    </div>
  )
}
