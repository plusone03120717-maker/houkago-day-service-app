'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

type StaffOption = { id: string; name: string }

type Vehicle = {
  id: string
  name: string
  capacity: number
  driver_staff_id: string | null
  driver?: { name: string } | null
}

interface Props {
  facilityId: string
  vehicles: Vehicle[]
  staffOptions: StaffOption[]
}

export function VehicleForm({ facilityId, vehicles, staffOptions }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(4)
  const [driverStaffId, setDriverStaffId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('transport_vehicles').insert({
      facility_id: facilityId,
      name: name.trim(),
      capacity,
      driver_staff_id: driverStaffId || null,
    })
    setSaving(false)
    setName('')
    setCapacity(4)
    setDriverStaffId('')
    startTransition(() => router.refresh())
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('transport_vehicles').delete().eq('id', id)
    setDeleting(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* 既存車両一覧 */}
      {vehicles.length > 0 && (
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{v.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  定員 {v.capacity}名
                  {v.driver?.name && ` ・ ドライバー: ${v.driver.name}`}
                </p>
              </div>
              <button
                onClick={() => handleDelete(v.id)}
                disabled={deleting === v.id}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {vehicles.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">登録された車両がありません</p>
      )}

      {/* 追加フォーム */}
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

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">担当ドライバー（任意）</label>
          <select
            value={driverStaffId}
            onChange={(e) => setDriverStaffId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">未設定</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
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
    </div>
  )
}
