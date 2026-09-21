'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'
import {
  DEADLINE_DAY_OPTIONS,
  firstOpenMonth,
  type ReservationDeadline,
} from '@/lib/parent-reservation-deadline'

export type FacilityDeadlineSetting = {
  facilityId: string
  facilityName: string
  enabled: boolean
  day: number
}

/**
 * 利用連絡の申込締切の設定。
 *
 * 締め切るのは「保護者が新しい利用日を増やすこと」だけで、
 * すでに予定が入っている日の利用時間・送迎の変更は締切後も保護者から送れる。
 * 締切後の追加は、これまでどおり電話で受けてスタッフが利用状況ページから入れる。
 */
export function ParentPortalSettingsForm({
  initial,
  today,
}: {
  initial: FacilityDeadlineSetting[]
  today: string
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<FacilityDeadlineSetting[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (facilityId: string, patch: Partial<FacilityDeadlineSetting>) => {
    setRows((prev) => prev.map((r) => (r.facilityId === facilityId ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('parent_portal_settings').upsert(
      rows.map((r) => ({
        facility_id: r.facilityId,
        reservation_deadline_enabled: r.enabled,
        reservation_deadline_day: r.day,
      })),
      { onConflict: 'facility_id' }
    )
    setSaving(false)
    if (err) {
      setError('保存に失敗しました')
      return
    }
    setSaved(true)
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        施設の情報を読み取れませんでした。
        システム管理者のアカウントでログインしてお試しください
        （施設がまだ無い場合は「施設・ユニット管理」で登録してください）。
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const deadline: ReservationDeadline = { enabled: row.enabled, day: row.day }
        const open = firstOpenMonth(today, deadline)
        return (
          <div
            key={row.facilityId}
            className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-3"
          >
            {rows.length > 1 && (
              <p className="text-sm font-medium text-gray-900">{row.facilityName}</p>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">利用予定の申込締切を使う</p>
                <p className="text-xs text-gray-500">
                  OFFにすると、保護者は当日以降であればいつでも新しい日を連絡できます
                </p>
              </div>
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={() => update(row.facilityId, { enabled: !row.enabled })}
                className="w-4 h-4 text-indigo-600 rounded"
              />
            </div>

            {row.enabled && (
              <div className="ml-4 p-3 rounded-lg border border-indigo-100 bg-indigo-50 space-y-2">
                <label className="text-xs font-medium text-indigo-800 block">締切日</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-900">翌月分は前月の</span>
                  <select
                    aria-label="締切日"
                    value={row.day}
                    onChange={(e) => update(row.facilityId, { day: Number(e.target.value) })}
                    className="border border-indigo-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {DEADLINE_DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}日</option>
                    ))}
                  </select>
                  <span className="text-xs text-indigo-900">まで</span>
                </div>
                <p className="text-xs text-indigo-700">
                  例：{row.day}日に設定すると、10月分の新しいご利用日は9月{row.day}日まで受け付けます
                  （締切日当日は受け付けます）。
                </p>
                <p className="text-xs font-medium text-indigo-800">
                  今日（{today}）の時点で、保護者が新しい日を連絡できるのは
                  {open.year}年{open.month}月分からです
                </p>
              </div>
            )}
          </div>
        )
      })}

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">
          締め切るのは<strong>新しい利用日を増やすこと</strong>だけです。
          すでに利用予定が入っている日・保護者が以前に連絡した日の
          <strong>利用時間や送迎の変更</strong>は、締切後も保護者から送れます。
        </p>
        <p className="mt-1 text-xs text-amber-700">
          締切後の追加は、これまでどおりお電話で受けて「利用状況」から入れてください。
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '設定を保存'}
        </Button>
        {saved && <span className="text-xs text-green-600">保存しました</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
