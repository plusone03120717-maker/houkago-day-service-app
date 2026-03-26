export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Car } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChildTransportSettingsForm } from '@/components/children/child-transport-settings-form'

type TransportSettings = {
  id: string
  pickup_location_type: 'home' | 'school'
  dropoff_location_type: 'home' | 'school'
  notes: string | null
}

export default async function ChildTransportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: childRaw } = await supabase
    .from('children')
    .select('id, name, address, school_name')
    .eq('id', id)
    .single()

  if (!childRaw) notFound()
  const child = childRaw as { id: string; name: string; address: string | null; school_name: string | null }

  const { data: settingsRaw } = await supabase
    .from('child_transport_settings')
    .select('id, pickup_location_type, dropoff_location_type, notes')
    .eq('child_id', id)
    .maybeSingle()
  const settings = settingsRaw as TransportSettings | null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/children/${id}`} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{child.name} の送迎設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">乗降場所のデフォルト設定</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-indigo-500" />
            送迎設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChildTransportSettingsForm
            childId={id}
            childAddress={child.address}
            schoolName={child.school_name}
            initial={
              settings
                ? {
                    id: settings.id,
                    pickup_location_type: settings.pickup_location_type,
                    dropoff_location_type: settings.dropoff_location_type,
                    notes: settings.notes ?? '',
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {(!child.address && !child.school_name) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          自宅住所・学校名が未登録です。
          <Link href={`/children/${id}/edit`} className="underline ml-1">
            基本情報を編集
          </Link>
          して登録してください。
        </div>
      )}
    </div>
  )
}
