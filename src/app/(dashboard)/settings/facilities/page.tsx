import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Building2, Users } from 'lucide-react'

type Unit = {
  id: string
  name: string
  service_type: string
  capacity: number
  is_active: boolean
}

type Facility = {
  id: string
  name: string
  facility_number: string
  postal_code: string | null
  address: string | null
  phone: string | null
  is_active: boolean
  units: Unit[]
}

const serviceTypeLabel: Record<string, string> = {
  afterschool: '放課後等デイサービス',
  child_dev: '児童発達支援',
}

export default async function SettingsFacilitiesPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: facilitiesRaw } = await supabase
    .from('facilities')
    .select('id, name, facility_number, postal_code, address, phone, is_active, units(id, name, service_type, capacity, is_active)')
    .order('name')
  const facilities = (facilitiesRaw ?? []) as unknown as Facility[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">施設・ユニット管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">施設情報とユニット設定の確認</p>
        </div>
      </div>

      {facilities.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          施設情報がありません。データベースに施設を登録してください。
        </div>
      ) : (
        facilities.map((facility) => (
          <Card key={facility.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                  <div>
                    <CardTitle className="text-base">{facility.name}</CardTitle>
                    <p className="text-xs text-gray-400">事業所番号: {facility.facility_number}</p>
                  </div>
                </div>
                <Badge variant={facility.is_active ? 'success' : 'secondary'}>
                  {facility.is_active ? '稼働中' : '停止中'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                {facility.address && <div>📍 {facility.address}</div>}
                {facility.postal_code && <div>〒 {facility.postal_code}</div>}
                {facility.phone && <div>📞 {facility.phone}</div>}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">ユニット</p>
                <div className="space-y-2">
                  {facility.units.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900">{unit.name}</span>
                        <span className="ml-2 text-xs text-gray-400">
                          {serviceTypeLabel[unit.service_type] ?? unit.service_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          定員 {unit.capacity}名
                        </span>
                        <Badge
                          variant={unit.is_active ? 'success' : 'secondary'}
                          className="text-xs"
                        >
                          {unit.is_active ? '稼働' : '停止'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
