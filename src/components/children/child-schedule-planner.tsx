'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Power, CalendarRange } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Unit = { id: string; name: string; service_type: string }
type Plan = {
  id: string
  unit_id: string
  day_of_week: number[]
  start_date: string
  end_date: string | null
  is_active: boolean
  units: { name: string } | null
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const DAY_COLORS: Record<number, string> = {
  0: 'bg-red-100 text-red-700 border-red-300',
  1: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  2: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  3: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  4: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  5: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  6: 'bg-blue-100 text-blue-700 border-blue-300',
}

interface Props {
  childId: string
  childName: string
  units: Unit[]
  initialPlans: Plan[]
}

export function ChildSchedulePlanner({ childId, units, initialPlans }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // フォーム状態
  const [selectedUnit, setSelectedUnit] = useState(units[0]?.id ?? '')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [noEndDate, setNoEndDate] = useState(true)

  const toggleDay = (d: number) =>
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())

  // 保存後に当月〜翌2ヶ月分の予約を自動生成
  const autoGenerateReservations = async (planId: string) => {
    const now = new Date()
    const months = [0, 1, 2].map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    await Promise.all(
      months.map((month) =>
        fetch('/api/usage-plans/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, month }),
        })
      )
    )
  }

  const handleAdd = async () => {
    if (!selectedUnit || selectedDays.length === 0 || !startDate) return
    setSaving(true)
    setSaveError(null)
    const { data, error } = await supabase
      .from('usage_plans')
      .insert({
        child_id: childId,
        unit_id: selectedUnit,
        day_of_week: selectedDays,
        start_date: startDate,
        end_date: noEndDate ? null : (endDate || null),
        is_active: true,
      })
      .select('id, unit_id, day_of_week, start_date, end_date, is_active, units(name)')
      .single()
    if (error) {
      setSaving(false)
      setSaveError(error.message)
      return
    }
    if (data) {
      await autoGenerateReservations(data.id)
      setSaving(false)
      setPlans((prev) => [data as unknown as Plan, ...prev])
      setShowForm(false)
      setSelectedDays([1, 2, 3, 4, 5])
      setStartDate(new Date().toISOString().slice(0, 10))
      setEndDate('')
      setNoEndDate(true)
      startTransition(() => router.refresh())
    }
  }

  const handleToggleActive = async (plan: Plan) => {
    await supabase
      .from('usage_plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id)
    setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, is_active: !p.is_active } : p))
  }

  const handleDelete = async (planId: string) => {
    if (!confirm('このスケジュールを削除しますか？')) return
    await supabase.from('usage_plans').delete().eq('id', planId)
    setPlans((prev) => prev.filter((p) => p.id !== planId))
  }


  return (
    <div className="space-y-4">
      {/* 既存プラン一覧 */}
      {plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.is_active ? '' : 'opacity-60'}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {plan.units?.name ?? '—'}
                      </span>
                      <Badge variant={plan.is_active ? 'success' : 'secondary'} className="text-xs">
                        {plan.is_active ? '有効' : '無効'}
                      </Badge>
                    </div>

                    {/* 曜日バッジ */}
                    <div className="flex gap-1.5 flex-wrap">
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <span
                          key={d}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border ${
                            plan.day_of_week.includes(d)
                              ? DAY_COLORS[d]
                              : 'bg-gray-100 text-gray-300 border-gray-200'
                          }`}
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>

                    {/* 期間 */}
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5" />
                      {formatDate(plan.start_date)} 〜 {plan.end_date ? formatDate(plan.end_date) : '終了日なし'}
                    </p>

                  </div>

                  {/* アクション */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleActive(plan)}
                      title={plan.is_active ? '無効にする' : '有効にする'}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      title="削除"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {plans.length === 0 && !showForm && (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          スケジュールが登録されていません
        </div>
      )}

      {/* 新規追加フォーム */}
      {showForm ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">新しいスケジュールを追加</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ユニット選択 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">ユニット</label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* 曜日選択 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">繰り返す曜日</label>
              <div className="flex gap-2">
                {DAY_LABELS.map((label, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors ${
                      selectedDays.includes(d)
                        ? DAY_COLORS[d] + ' border-current'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {selectedDays.length === 0 && (
                <p className="text-xs text-red-500 mt-1">曜日を1つ以上選択してください</p>
              )}
            </div>

            {/* 開始日 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">開始日</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">終了日</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noEndDate}
                      onChange={(e) => setNoEndDate(e.target.checked)}
                      className="rounded"
                    />
                    終了日を設定しない
                  </label>
                  {!noEndDate && (
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                エラー: {saveError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>キャンセル</Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={saving || selectedDays.length === 0 || !selectedUnit || !startDate}
              >
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          スケジュールを追加
        </Button>
      )}
    </div>
  )
}
