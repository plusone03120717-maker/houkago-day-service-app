import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UsageCalendar } from '@/components/usage/usage-calendar'

type Unit = {
  id: string
  name: string
  capacity: number
}

type Reservation = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  children: { name: string } | null
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; unit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const now = new Date()
  const year = parseInt(params.year ?? String(now.getFullYear()))
  const month = parseInt(params.month ?? String(now.getMonth() + 1))

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data: unitsRaw } = await supabase
    .from('units')
    .select('id, name, capacity')
    .order('name')
  const units = (unitsRaw ?? []) as unknown as Unit[]

  const selectedUnitId = params.unit ?? units[0]?.id ?? ''

  const { data: reservationsRaw } = selectedUnitId
    ? await supabase
        .from('usage_reservations')
        .select('id, child_id, unit_id, date, status, children(name)')
        .eq('unit_id', selectedUnitId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
    : { data: [] }
  const reservations = (reservationsRaw ?? []) as unknown as Reservation[]

  // 統計
  const confirmedCount = reservations.filter((r) => r.status === 'confirmed').length
  const reservedCount = reservations.filter((r) => r.status === 'reserved').length
  const cancelledCount = reservations.filter((r) => r.status === 'cancelled').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">利用状況</h1>
        <p className="text-sm text-gray-500 mt-0.5">予約・利用申し込みの確認・承認</p>
      </div>

      <UsageCalendar
        year={year}
        month={month}
        units={units}
        selectedUnitId={selectedUnitId}
        reservations={reservations}
        summary={{ confirmed: confirmedCount, reserved: reservedCount, cancelled: cancelledCount }}
      />
    </div>
  )
}
