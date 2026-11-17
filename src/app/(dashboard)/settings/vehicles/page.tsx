export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { loadRetired } from '@/lib/retired'
import { requireAdmin, getStaffAccess } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Car } from 'lucide-react'
import { VehicleForm } from '@/components/settings/vehicle-form'

type Vehicle = {
  id: string
  name: string
  capacity: number
}

export default async function VehiclesPage() {
  await requireAdmin()
  // 施設長・スタッフは閲覧のみ（編集できるのはシステム管理者だけ・2026-11-12 依頼主）
  const canEdit = (await getStaffAccess())?.canEditOperations ?? false
  const supabase = await createClient()

  // 前は「担当ドライバー」の名前を、名前の列がない表（staff_profiles）から読もうとして読みこみ全体が失敗し、
  // 登録した車があっても「登録された車両がありません」と出ていた（2026-11-17 に気づいて直した）。
  // 担当ドライバーはほかのどこでも使っていないので、読まない
  const [{ data: facilitiesRaw }, { data: vehiclesRaw }] = await Promise.all([
    supabase.from('facilities').select('id').order('name').limit(1),
    supabase.from('transport_vehicles').select('id, name, capacity').order('name'),
  ])

  const facilityId = (facilitiesRaw?.[0] as { id: string } | undefined)?.id ?? ''
  // 使わない車は印をつけて下に並べる（2026-11-17）
  const retired = await loadRetired(supabase)
  const vehicles = ((vehiclesRaw ?? []) as unknown as Vehicle[])
    .map((v) => ({ ...v, retired_at: retired.vehicles.get(v.id) ?? null }))
    .sort((a, b) => Number(!!a.retired_at) - Number(!!b.retired_at))

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
            canEdit={canEdit}
          />
        </CardContent>
      </Card>
    </div>
  )
}
