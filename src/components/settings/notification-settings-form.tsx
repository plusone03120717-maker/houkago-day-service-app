'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

type Settings = {
  id?: string
  facility_id: string | null
  notify_contact_note: boolean
  contact_note_timing: string
  notify_billing: boolean
  notify_reservation: boolean
  notify_announcement: boolean
  notify_transport_status: boolean
}

interface Props {
  facilityId: string | null
  initial: Settings | null
}

export function NotificationSettingsForm({ facilityId, initial }: Props) {
  const supabase = createClient()
  const [settings, setSettings] = useState<Settings>(
    initial ?? {
      facility_id: facilityId,
      notify_contact_note: true,
      contact_note_timing: 'immediate',
      notify_billing: true,
      notify_reservation: true,
      notify_announcement: true,
      notify_transport_status: false,
    }
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = (key: keyof Settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const data = { ...settings, facility_id: facilityId }
    if (settings.id) {
      await supabase
        .from('notification_settings')
        .update(data)
        .eq('id', settings.id)
    } else {
      const { data: inserted } = await supabase
        .from('notification_settings')
        .insert(data)
        .select('id')
        .single()
      if (inserted) {
        setSettings((prev) => ({ ...prev, id: (inserted as { id: string }).id }))
      }
    }
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="space-y-4">
      {/* 連絡帳通知 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
          <div>
            <p className="text-sm font-medium text-gray-900">連絡帳通知</p>
            <p className="text-xs text-gray-500">連絡帳が公開されたとき保護者に通知</p>
          </div>
          <input
            type="checkbox"
            checked={settings.notify_contact_note}
            onChange={() => toggle('notify_contact_note')}
            className="w-4 h-4 text-indigo-600 rounded"
          />
        </div>

        {settings.notify_contact_note && (
          <div className="ml-4 p-3 rounded-lg border border-indigo-100 bg-indigo-50 space-y-2">
            <p className="text-xs font-medium text-indigo-800">通知タイミング</p>
            {[
              { value: 'immediate', label: '公開直後に送信' },
              { value: 'daily_17', label: '毎日17:00にまとめて送信' },
              { value: 'daily_18', label: '毎日18:00にまとめて送信' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contact_note_timing"
                  value={opt.value}
                  checked={settings.contact_note_timing === opt.value}
                  onChange={() => {
                    setSettings((prev) => ({ ...prev, contact_note_timing: opt.value }))
                    setSaved(false)
                  }}
                  className="w-3.5 h-3.5 text-indigo-600"
                />
                <span className="text-xs text-indigo-900">{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* その他の通知トグル */}
      {[
        {
          key: 'notify_reservation' as const,
          label: '予約確認通知',
          desc: '予約が承認・キャンセルされたとき保護者に通知',
        },
        {
          key: 'notify_billing' as const,
          label: '請求書通知',
          desc: '請求書が発行されたとき保護者に通知',
        },
        {
          key: 'notify_announcement' as const,
          label: 'お知らせ通知',
          desc: '新しいお知らせが投稿されたとき保護者に通知',
        },
        {
          key: 'notify_transport_status' as const,
          label: '送迎状況通知',
          desc: '送迎のステータスが変更されたとき保護者に通知',
        },
      ].map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">{item.label}</p>
            <p className="text-xs text-gray-500">{item.desc}</p>
          </div>
          <input
            type="checkbox"
            checked={settings[item.key] as boolean}
            onChange={() => toggle(item.key)}
            className="w-4 h-4 text-indigo-600 rounded"
          />
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '設定を保存'}
        </Button>
        {saved && <span className="text-xs text-green-600">保存しました</span>}
      </div>
    </div>
  )
}
