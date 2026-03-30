'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, CalendarX } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Holiday = {
  id: string
  label: string
  start_date: string
  end_date: string
}

interface Props {
  childId: string
  initial: Holiday[]
}

export function SchoolHolidaySection({ childId, initial }: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [holidays, setHolidays] = useState<Holiday[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ label: '', start_date: '', end_date: '', type: 'period' as 'period' | 'single' })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.label.trim() || !form.start_date) {
      setError('名称と開始日は必須です')
      return
    }
    const endDate = form.type === 'single' ? form.start_date : form.end_date
    if (!endDate) {
      setError('終了日は必須です')
      return
    }
    if (endDate < form.start_date) {
      setError('終了日は開始日以降にしてください')
      return
    }

    setSaving(true)
    setError('')
    const { data, error: e } = await supabase
      .from('child_school_holidays')
      .insert({ child_id: childId, label: form.label.trim(), start_date: form.start_date, end_date: endDate })
      .select('id, label, start_date, end_date')
      .single()

    if (e) { setError(e.message); setSaving(false); return }
    setHolidays((prev) => [...prev, data as Holiday].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    setForm({ label: '', start_date: '', end_date: '', type: 'period' })
    setShowForm(false)
    setSaving(false)
    startTransition(() => {})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この学校休日を削除しますか？')) return
    const { error: e } = await supabase.from('child_school_holidays').delete().eq('id', id)
    if (e) { alert(e.message); return }
    setHolidays((prev) => prev.filter((h) => h.id !== id))
  }

  return (
    <div className="space-y-3">
      {holidays.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 text-center py-2">学校休日が登録されていません</p>
      )}

      {holidays.length > 0 && (
        <div className="divide-y divide-gray-100">
          {holidays.map((h) => {
            const isSingle = h.start_date === h.end_date
            return (
              <div key={h.id} className="flex items-center justify-between py-2.5 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{h.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isSingle
                      ? formatDate(h.start_date)
                      : `${formatDate(h.start_date)} 〜 ${formatDate(h.end_date)}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(h.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">種別</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="period"
                  checked={form.type === 'period'}
                  onChange={() => setForm((p) => ({ ...p, type: 'period' }))}
                  className="accent-indigo-600"
                />
                期間（夏休みなど）
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="single"
                  checked={form.type === 'single'}
                  onChange={() => setForm((p) => ({ ...p, type: 'single' }))}
                  className="accent-indigo-600"
                />
                個別日付（振替休日など）
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">名称 *</label>
            <Input
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder={form.type === 'period' ? '例: 夏休み' : '例: 振替休日'}
            />
          </div>

          <div className={`grid gap-3 ${form.type === 'period' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                {form.type === 'period' ? '開始日 *' : '日付 *'}
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {form.type === 'period' && (
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">終了日 *</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  min={form.start_date || undefined}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? '保存中...' : '追加'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setError('') }}>
              キャンセル
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          学校休日を追加
        </Button>
      )}
    </div>
  )
}
