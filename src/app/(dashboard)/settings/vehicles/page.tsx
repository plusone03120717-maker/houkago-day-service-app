export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Car } from 'lucide-react'
import { VehicleForm } from '@/components/settings/vehicle-form'

type Vehicle = {
  id: string
  name: string
  capacity: number
  driver_staff_id: string | null
  driver: { name: string } | null
}

type StaffOption = { id: string; name: string }

export default async function VehiclesPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: facilitiesRaw }, { data: vehiclesRaw }, { data: staffRaw }] = await Promise.all([
    supabase.from('facilities').select('id').order('name').limit(1),
    supabase
      .from('transport_vehicles')
      .select('id, name, capacity, driver_staff_id, driver:driver_staff_id(name)')
      .order('name'),
    supabase
      .from('users')
      .select('id, name')
      .in('role', ['admin', 'staff'])
      .order('name'),
  ])

  const facilityId = (facilitiesRaw?.[0] as { id: string } | undefined)?.id ?? ''
  const vehicles = (vehiclesRaw ?? []) as unknown as Vehicle[]
  const staffOptions = (staffRaw ?? []) as unknown as StaffOption[]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">車両管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">送迎車両の登録・管理</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-indigo-500" />
            送迎車両一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VehicleForm
            facilityId={facilityId}
            vehicles={vehicles}
            staffOptions={staffOptions}
          />
        </CardContent>
      </Card>
    </div>
  )
}
