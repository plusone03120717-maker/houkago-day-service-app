import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import {
  ParentPortalSettingsForm,
  type FacilityDeadlineSetting,
} from '@/components/settings/parent-portal-settings-form'
import { getTodayJST } from '@/lib/utils'

/**
 * 保護者ポータルの運用設定。
 * いまのところ「利用予定の申込締切」だけだが、保護者側の決まりごとはここに集める。
 */
export default async function ParentPortalSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [{ data: facilityRows }, { data: settingRows }] = await Promise.all([
    supabase.from('facilities').select('id, name').order('name'),
    supabase
      .from('parent_portal_settings')
      .select('facility_id, reservation_deadline_enabled, reservation_deadline_day'),
  ])

  type SettingRow = {
    facility_id: string
    reservation_deadline_enabled: boolean
    reservation_deadline_day: number
  }
  const byFacility = new Map(
    ((settingRows ?? []) as unknown as SettingRow[]).map((r) => [r.facility_id, r])
  )

  const initial: FacilityDeadlineSetting[] = (
    (facilityRows ?? []) as unknown as { id: string; name: string }[]
  ).map((f) => {
    const s = byFacility.get(f.id)
    return {
      facilityId: f.id,
      facilityName: f.name,
      enabled: s?.reservation_deadline_enabled ?? false,
      day: s?.reservation_deadline_day ?? 15,
    }
  })

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">保護者ポータル設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">利用連絡の受付ルールを設定します</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">利用予定の申込締切</CardTitle>
        </CardHeader>
        <CardContent>
          <ParentPortalSettingsForm initial={initial} today={getTodayJST()} />
        </CardContent>
      </Card>
    </div>
  )
}
