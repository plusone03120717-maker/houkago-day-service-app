'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, Car } from 'lucide-react'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { applyChildPickupLocation } from '@/app/actions/transport-location'
import { PickupReviewDialog } from '@/components/children/pickup-review-dialog'
import type { PickupReviewItem } from '@/lib/pickup-review'

type LocationType = 'home' | 'school'
type TransportType = 'none' | 'pickup_only' | 'dropoff_only' | 'both'

type TransportSettings = {
  id?: string
  transport_type: TransportType
  pickup_location_type: LocationType
  dropoff_location_type: LocationType
  pickup_location_label: string
  notes: string
}

interface Props {
  childId: string
  childAddress: string | null
  schoolName: string | null
  schoolAddress: string | null
  initial: TransportSettings | null
}

const TRANSPORT_TYPE_OPTIONS: { value: TransportType; label: string }[] = [
  { value: 'none', label: '送迎なし' },
  { value: 'pickup_only', label: '行きのみ' },
  { value: 'dropoff_only', label: '帰りのみ' },
  { value: 'both', label: '行き・帰り両方' },
]

export function ChildTransportSettingsForm({ childId, childAddress, schoolName, schoolAddress, initial }: Props) {
  const supabase = createClient()
  const [settings, setSettings] = useState<TransportSettings>(
    initial ?? {
      transport_type: 'both',
      pickup_location_type: 'home',
      dropoff_location_type: 'home',
      pickup_location_label: '',
      notes: '',
    }
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 最後に保存したお迎え場所。変えたときだけ利用スケジュールと送迎管理にも広げる
  const [savedPickupLocation, setSavedPickupLocation] = useState<LocationType>(
    initial?.pickup_location_type ?? 'home'
  )
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // 変えるかどうかを選んでもらう送迎の日（送迎管理で選んだ場所・保護者の利用連絡・特定日・土日祝）
  const [pickupReview, setPickupReview] = useState<PickupReviewItem[]>([])

  const locationLabel = (type: LocationType) => {
    if (type === 'home') return childAddress ? `自宅（${childAddress}）` : '自宅'
    if (schoolName && schoolAddress) return `${schoolName}（${schoolAddress}）`
    if (schoolName) return `学校（${schoolName}）`
    return '学校'
  }

  const showPickup = settings.transport_type === 'pickup_only' || settings.transport_type === 'both'
  const showDropoff = settings.transport_type === 'dropoff_only' || settings.transport_type === 'both'

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    setSyncNote(null)

    const payload = {
      child_id: childId,
      transport_type: settings.transport_type,
      pickup_location_type: settings.pickup_location_type,
      pickup_location_label: settings.pickup_location_label || null,
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

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    // 送迎管理が見るのは利用スケジュールのお迎え場所。送迎設定だけ変えても
    // 送迎管理は前の場所のままだったので、利用スケジュールと先の日の送迎もそろえる
    const nextPickup = settings.pickup_location_type
    if (nextPickup !== savedPickupLocation) {
      try {
        const res = await applyChildPickupLocation(childId, savedPickupLocation, nextPickup)
        if (!res.ok) {
          setSyncNote('利用スケジュールのお迎え場所は変わっていません。利用スケジュールを編集できる人に変更を頼んでください。')
        } else {
          if (res.plansUpdated > 0 || res.updated > 0) {
            setSyncNote(
              `利用スケジュールのお迎え場所も「${nextPickup === 'school' ? '学校' : '自宅'}」にそろえました` +
              (res.updated > 0 ? `（作成ずみの送迎 ${res.updated} 件も変更）。` : '。')
            )
          }
          if (res.review.length > 0) setPickupReview(res.review)
        }
      } catch {
        setSyncNote('利用スケジュールと送迎管理への反映に失敗しました。もう一度保存してください。')
        setSaving(false)
        return
      }
      setSavedPickupLocation(nextPickup)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* 送迎区分 */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-2">送迎区分</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TRANSPORT_TYPE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, transport_type: value }))}
              className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                settings.transport_type === value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* お迎え設定 */}
      {showPickup && (
        <>
          <div className="border-t border-gray-100" />
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
            {settings.pickup_location_type === 'home' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  場所の表示名
                  <span className="text-gray-400 font-normal ml-1">（空欄の場合は「自宅」と表示）</span>
                </label>
                <input
                  type="text"
                  value={settings.pickup_location_label}
                  onChange={(e) => setSettings((prev) => ({ ...prev, pickup_location_label: e.target.value }))}
                  placeholder="例：おばあちゃんの家、祖父宅"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  自宅以外の場所（祖父母宅など）をお迎えする場合に入力してください。送迎スケジュールにこの名前が表示されます。
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* お送り設定 */}
      {showDropoff && (
        <>
          <div className="border-t border-gray-100" />
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
        </>
      )}

      <div className="border-t border-gray-100" />

      {/* 備考 */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">備考</label>
        <AutoTextarea
          value={settings.notes}
          onChange={(e) => setSettings((prev) => ({ ...prev, notes: e.target.value }))}
          minRows={3}
          placeholder="送迎に関する注意事項など"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {syncNote && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">{syncNote}</div>
      )}

      {pickupReview.length > 0 && (
        <PickupReviewDialog
          key={pickupReview.map((i) => i.id).join(',')}
          childId={childId}
          items={pickupReview}
          onClose={(changed) => {
            setPickupReview([])
            if (changed > 0) {
              setSyncNote((prev) => `${prev ? `${prev} ` : ''}確認した日のうち ${changed} 件も変えました。`)
            }
          }}
        />
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : saved ? '保存しました' : '保存'}
      </Button>
    </div>
  )
}
