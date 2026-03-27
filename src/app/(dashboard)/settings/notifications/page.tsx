import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { NotificationSettingsForm } from '@/components/settings/notification-settings-form'
import { LineTestButton } from '@/components/settings/line-test-button'

type NotificationSettings = {
  id: string
  facility_id: string | null
  notify_contact_note: boolean
  contact_note_timing: string
  notify_billing: boolean
  notify_reservation: boolean
  notify_announcement: boolean
  notify_transport_status: boolean
}

export default async function NotificationsSettingsPage() {
  const supabase = await createClient()

  const { data: facilityRaw } = await supabase
    .from('facilities')
    .select('id, name')
    .limit(1)
    .single()
  const facility = facilityRaw as unknown as { id: string; name: string } | null

  const { data: settingsRaw } = facility
    ? await supabase
        .from('notification_settings')
        .select('*')
        .eq('facility_id', facility.id)
        .limit(1)
        .single()
    : { data: null }
  const settings = settingsRaw as unknown as NotificationSettings | null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通知設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">保護者への通知タイミングを設定します</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600">
          <p>
            各通知は保護者のマイページアプリに表示されます。プッシュ通知は今後のアップデートで対応予定です。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">通知設定</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationSettingsForm
            facilityId={facility?.id ?? null}
            initial={settings}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">LINE送迎通知テスト</CardTitle>
        </CardHeader>
        <CardContent>
          <LineTestButton />
        </CardContent>
      </Card>
    </div>
  )
}
