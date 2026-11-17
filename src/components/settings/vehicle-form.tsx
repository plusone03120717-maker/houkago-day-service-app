'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Ban, RotateCcw } from 'lucide-react'
import { deleteVehicleIfUnused, setVehicleRetired } from '@/app/actions/retire'
import { todayJst } from '@/lib/retired'

type Vehicle = {
  id: string
  name: string
  capacity: number
  /** 使わなくなった日（使用中は null）。翌日から選ぶ欄から外れる */
  retired_at?: string | null
}

interface Props {
  facilityId: string
  vehicles: Vehicle[]
  /** 車両の追加・削除ができるか。システム管理者だけ true（施設長・スタッフは閲覧のみ） */
  canEdit?: boolean
}

export function VehicleForm({ facilityId, vehicles: initialVehicles, canEdit = true }: Props) {
  const supabase = createClient()

  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(4)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!canEdit) return
    if (!name.trim()) return
    if (!facilityId) {
      setError('施設情報が取得できません。施設設定を確認してください。')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('transport_vehicles')
      .insert({
        facility_id: facilityId,
        name: name.trim(),
        capacity,
      })
      .select('id, name, capacity')
      .single()

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    // ローカル状態を即時更新
    setVehicles((prev) => [...prev, { ...data, retired_at: null }])
    setName('')
    setCapacity(4)
  }

  /** 削除は、記録が1件もないとき（まちがえて登録したときなど）だけ。記録があればサーバーが断る */
  const handleDelete = async (v: Vehicle) => {
    if (!canEdit) return
    if (!confirm(`「${v.name}」を削除しますか？\n記録が1件もないときだけ削除できます。使わなくなった車は「使わない」にしてください。`)) return
    setDeleting(v.id)
    setError(null)
    const res = await deleteVehicleIfUnused(v.id)
    setDeleting(null)
    if (!res.ok) {
      setError(res.message)
      return
    }
    // ローカル状態を即時更新
    setVehicles((prev) => prev.filter((x) => x.id !== v.id))
  }

  /** 使わないにする（今日の日付）／使用中に戻す。記録は残り、翌日から選ぶ欄から外れる */
  const handleRetire = async (v: Vehicle, next: string | null) => {
    if (!canEdit) return
    if (next && !confirm(`「${v.name}」を ${next} で使わないにしますか？\n翌日から、送迎の車種のボタンや選ぶ欄から外れます。送迎の記録は残ります。`)) return
    setDeleting(v.id)
    setError(null)
    const res = await setVehicleRetired(v.id, next)
    setDeleting(null)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, retired_at: next } : x)))
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          車両は閲覧のみです。追加・削除はできません。
        </p>
      )}

      {/* 既存車両一覧 */}
      {vehicles.length > 0 && (
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
            >
              <div>
                <p className={`text-sm font-medium ${v.retired_at ? 'text-gray-400' : 'text-gray-900'}`}>
                  {v.name}
                  {v.retired_at && (
                    <span className="ml-2 rounded-full bg-gray-600 px-2 py-0.5 text-[10px] font-bold text-white align-middle" data-testid="vehicle-retired">
                      使わない {v.retired_at}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  定員 {v.capacity}名
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  {v.retired_at ? (
                    <button
                      onClick={() => handleRetire(v, null)}
                      disabled={deleting === v.id}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      使うに戻す
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRetire(v, todayJst())}
                      disabled={deleting === v.id}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      使わないにする
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(v)}
                    disabled={deleting === v.id}
                    title="削除（記録が1件もないときだけ）"
                    aria-label={`${v.name} を削除`}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {vehicles.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">登録された車両がありません</p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 追加フォーム（閲覧のみのときは出さない） */}
      {canEdit && (
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">車両を追加</p>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            車両名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 送迎バス1号、軽ワゴン"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">定員（人）</label>
          <input
            type="number"
            value={capacity}
            min={1}
            max={20}
            onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <Button
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          size="sm"
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          {saving ? '追加中...' : '車両を追加'}
        </Button>
      </div>
      )}
    </div>
  )
}
