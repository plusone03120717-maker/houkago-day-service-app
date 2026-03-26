'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, Car } from 'lucide-react'

type LocationType = 'home' | 'school'

type TransportSettings = {
  id?: string
  pickup_location_type: LocationType
  dropoff_location_type: LocationType
  notes: string
}

interface Props {
  childId: string
  childAddress: string | null
  schoolName: string | null
  initial: TransportSettings | null
}

export function ChildTransportSettingsForm({ childId, childAddress, schoolName, initial }: Props) {
  const supabase = createClient()
  const [settings, setSettings] = useState<TransportSettings>(
    initial ?? {
      pickup_location_type: 'home',
      dropoff_location_type: 'home',
      notes: '',
    }
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locationLabel = (type: LocationType) => {
    if (type === 'home') return childAddress ? `自宅（${childAddress}）` : '自宅'
    return schoolName ? `学校（${schoolName}）` : '学校'
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)

    const payload = {
      child_id: childId,
      pickup_location_type: settings.pickup_location_type,
      dropoff_location_type: 'home',
      notes: settings.notes || null,
      updated_at: new Date().toISOString(),
    }

    let err
    if (settings.id) {
      const { error: updateError } = await supabase
        .from('child_transport_settings')
        .update(payload)
        .eq('id', settings.id)
      err = updateError
    } else {
      const { data, error: insertError } = await supabase
        .from('child_transport_settings')
        .insert(payload)
        .select('id')
        .single()
      err = insertError
      if (!insertError && data) {
        setSettings((prev) => ({ ...prev, id: data.id }))
      }
    }

    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-5">
      {/* お迎え設定 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-indigo-500" />
          <p className="text-sm font-semibold text-gray-700">お迎え（行き）</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">乗車場所</label>
          <div className="flex gap-3">
            {(['home', 'school'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, pickup_location_type: type }))}
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  settings.pickup_location_type === type
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {type === 'home' ? '自宅' : '学校'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{locationLabel(settings.pickup_location_type)}</p>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* お送り設定 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-green-500" />
          <p className="text-sm font-semibold text-gray-700">お送り（帰り）</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-2">降車場所</label>
          <div className="py-2.5 px-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 inline-block">
            自宅
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{childAddress ?? '自宅'}</p>
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* 備考 */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">備考</label>
        <textarea
          value={settings.notes}
          onChange={(e) => setSettings((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
          placeholder="送迎に関する注意事項など"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : saved ? '保存しました' : '保存'}
      </Button>
    </div>
  )
}
