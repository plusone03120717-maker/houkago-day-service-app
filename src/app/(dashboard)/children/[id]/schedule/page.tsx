import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChildSchedulePlanner } from '@/components/children/child-schedule-planner'
import { ChildAttendanceCalendar, type AttendanceRecord } from '@/components/children/child-attendance-calendar'

export default async function ChildSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { id: childId } = await params
  const sp = await searchParams
  const now = new Date()
  const year = parseInt(sp.year ?? String(now.getFullYear()))
  const month = parseInt(sp.month ?? String(now.getMonth() + 1))
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name, address, school_id, schools(id, name)')
    .eq('id', childId)
    .single()

  if (!childRaw) notFound()
  const child = childRaw as unknown as {
    id: string
    name: string
    address: string | null
    school_id: string | null
    schools: { id: string; name: string } | null
  }

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
    .select('id, name, child_id, unit_id, day_of_week, start_date, end_date, is_active, pickup_time, dropoff_time, transport_type, pickup_location_type, units(name)')
    .eq('child_id', childId)
    .order('start_date', { ascending: false })

  type Plan = {
    id: string
    name: string | null
    child_id: string
    unit_id: string
    day_of_week: number[]
    start_date: string
    end_date: string | null
    is_active: boolean
    pickup_time: string | null
    dropoff_time: string | null
    transport_type: string
    pickup_location_type: string
    units: { name: string } | null
  }
  const plans = (plansRaw ?? []) as unknown as Plan[]

  // 既存の送迎設定（新規追加時のデフォルト用）
  const { data: transportSettingRaw } = await supabase
    .from('child_transport_settings')
    .select('transport_type, pickup_location_type')
    .eq('child_id', childId)
    .maybeSingle()
  const defaultTransportType = (transportSettingRaw?.transport_type as string | null)
    ?? plans[0]?.transport_type
    ?? 'both'
  const defaultPickupLocationType = (transportSettingRaw?.pickup_location_type as string | null)
    ?? plans[0]?.pickup_location_type
    ?? 'home'

  // 曜日別設定を取得
  const planIds = plans.map((p) => p.id)
  const { data: daySettingsRaw } = planIds.length > 0
    ? await supabase
        .from('usage_plan_day_settings')
        .select('id, plan_id, day_of_week, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .in('plan_id', planIds)
    : { data: [] }

  type DaySetting = {
    id: string
    plan_id: string
    day_of_week: number
    transport_type: string
    pickup_location_type: string
    pickup_time: string | null
    dropoff_time: string | null
  }
  const daySettings = (daySettingsRaw ?? []) as unknown as DaySetting[]

  // 特定日上書き設定を取得
  const { data: dateOverridesRaw } = planIds.length > 0
    ? await supabase
        .from('usage_plan_date_overrides')
        .select('id, plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .in('plan_id', planIds)
        .order('date', { ascending: true })
    : { data: [] }

  type DateOverride = {
    id: string
    plan_id: string
    date: string
    transport_type: string
    pickup_location_type: string
    pickup_time: string | null
    dropoff_time: string | null
  }
  const dateOverrides = (dateOverridesRaw ?? []) as unknown as DateOverride[]

  // 当月の出席記録を取得
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const { data: attendancesRaw } = await supabase
    .from('daily_attendance')
    .select(`
      id, unit_id, date, status,
      check_in_time, check_out_time,
      pickup_departure_time, pickup_arrival_time,
      dropoff_departure_time, dropoff_arrival_time,
      service_start_time, service_end_time,
      daytime_support, daytime_support_start_time, daytime_support_end_time,
      units(name)
    `)
    .eq('child_id', childId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
  const attendances = (attendancesRaw ?? []) as unknown as AttendanceRecord[]

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
        childAddress={child.address}
        schoolName={child.schools?.name ?? null}
        units={units}
        initialPlans={plans}
        initialDaySettings={daySettings}
        initialDateOverrides={dateOverrides}
        defaultTransportType={defaultTransportType}
        defaultPickupLocationType={defaultPickupLocationType}
      />

      {/* 出席カレンダー */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            出席カレンダー
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChildAttendanceCalendar
            year={year}
            month={month}
            childId={childId}
            attendances={attendances}
          />
        </CardContent>
      </Card>
    </div>
  )
}
