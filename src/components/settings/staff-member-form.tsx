'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Save, CheckCircle, Trash2, Plus, X } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'driver',    label: 'ドライバー' },
  { value: 'therapist', label: '療育士' },
  { value: 'nurse',     label: '看護師' },
]

type HourlyRate = {
  id: string
  hourly_rate: number
  effective_from: string
  effective_to: string | null
}

interface Props {
  memberId: string
  initialName: string
  initialRoles: string[]
  initialLineUserId: string
  initialHourlyRates: HourlyRate[]
}

export function StaffMemberForm({
  memberId,
  initialName,
  initialRoles,
  initialLineUserId,
  initialHourlyRates,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [name, setName] = useState(initialName)
  const [roles, setRoles] = useState<Set<string>>(new Set(initialRoles))
  const [lineUserId, setLineUserId] = useState(initialLineUserId)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [hourlyRates, setHourlyRates] = useState<HourlyRate[]>(initialHourlyRates)
  const [addingRate, setAddingRate] = useState(false)
  const [newRate, setNewRate] = useState({ hourly_rate: '', effective_from: new Date().toISOString().slice(0, 10), effective_to: '' })
  const [savingRate, setSavingRate] = useState(false)

  const toggleRole = (value: string) => {
    setRoles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    const rolesArr = [...roles]
    await supabase
      .from('staff_members')
      .update({
        name: name.trim(),
        role: rolesArr[0] ?? 'driver',
        roles: rolesArr,
        line_user_id: lineUserId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
    setSaving(false)
    setSaved(true)
    startTransition(() => router.refresh())
  }

  const handleDelete = async () => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    setDeleting(true)
    await supabase.from('staff_members').delete().eq('id', memberId)
    router.push('/settings/staff')
  }

  const handleAddRate = async () => {
    const rate = parseInt(newRate.hourly_rate)
    if (!rate || rate <= 0) return
    setSavingRate(true)
    const { data } = await supabase
      .from('staff_hourly_rates')
      .insert({
        staff_member_id: memberId,
        hourly_rate: rate,
        effective_from: newRate.effective_from,
        effective_to: newRate.effective_to || null,
      })
      .select('id, hourly_rate, effective_from, effective_to')
      .single()
    if (data) {
      setHourlyRates((prev) => [...prev, data as HourlyRate].sort((a, b) => b.effective_from.localeCompare(a.effective_from)))
    }
    setNewRate({ hourly_rate: '', effective_from: new Date().toISOString().slice(0, 10), effective_to: '' })
    setAddingRate(false)
    setSavingRate(false)
  }

  const handleDeleteRate = async (rateId: string) => {
    if (!confirm('この時給設定を削除しますか？')) return
    await supabase.from('staff_hourly_rates').delete().eq('id', rateId)
    setHourlyRates((prev) => prev.filter((r) => r.id !== rateId))
  }

  return (
    <div className="space-y-5">
      {/* 氏名 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">氏名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false) }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* 役職 */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">
          役職
          <span className="ml-1 text-gray-400 font-normal">（複数選択可）</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleRole(opt.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                roles.has(opt.value)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* LINE User ID */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">
          LINE User ID
          <span className="ml-1 text-gray-400 font-normal">（送迎通知・タイムカードに必要）</span>
        </label>
        <input
          type="text"
          value={lineUserId}
          onChange={(e) => { setLineUserId(e.target.value); setSaved(false) }}
          placeholder="U1234567890abcdef..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
        />
        <p className="text-xs text-gray-400 mt-1">
          LINE公式アカウントにメッセージを送ると自動返信されます
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3.5 w-3.5" />
              保存しました
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          削除
        </Button>
      </div>

      {/* 時給設定 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-medium text-gray-700">時給設定</label>
          {!addingRate && (
            <button
              onClick={() => setAddingRate(true)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          )}
        </div>

        {hourlyRates.length === 0 && !addingRate && (
          <p className="text-xs text-gray-400">時給が設定されていません</p>
        )}

        {hourlyRates.length > 0 && (
          <div className="space-y-2 mb-3">
            {hourlyRates.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">¥{r.hourly_rate.toLocaleString()}/時</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {r.effective_from} 〜 {r.effective_to ?? '現在'}
                  </span>
                </div>
                <button
                  onClick={() => void handleDeleteRate(r.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingRate && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">時給（円）</label>
                <input
                  type="number"
                  min="1"
                  value={newRate.hourly_rate}
                  onChange={(e) => setNewRate({ ...newRate, hourly_rate: e.target.value })}
                  placeholder="1200"
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">開始日</label>
                <input
                  type="date"
                  value={newRate.effective_from}
                  onChange={(e) => setNewRate({ ...newRate, effective_from: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">終了日（任意）</label>
                <input
                  type="date"
                  value={newRate.effective_to}
                  onChange={(e) => setNewRate({ ...newRate, effective_to: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleAddRate()} disabled={savingRate || !newRate.hourly_rate}>
                {savingRate ? '保存中...' : '追加'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingRate(false)}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
