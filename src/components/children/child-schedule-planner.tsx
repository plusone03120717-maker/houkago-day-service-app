'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Power, CalendarRange, Clock, Pencil, X, Check, CalendarDays, Repeat } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Unit = { id: string; name: string; service_type: string }
type Plan = {
  id: string
  unit_id: string
  day_of_week: number[]
  start_date: string
  end_date: string | null
  is_active: boolean
  pickup_time: string | null
  dropoff_time: string | null
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

function formatTime(time: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

/** start_date === end_date なら日付指定の一回のみ */
function isOneTime(plan: Plan): boolean {
  return !!plan.end_date && plan.start_date === plan.end_date
}

interface EditState {
  unit_id: string
  mode: 'repeat' | 'once'
  day_of_week: number[]
  once_date: string
  start_date: string
  end_date: string
  no_end_date: boolean
  pickup_time: string
  dropoff_time: string
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // 新規追加フォーム状態
  const [addMode, setAddMode] = useState<'repeat' | 'once'>('repeat')
  const [selectedUnit, setSelectedUnit] = useState(units[0]?.id ?? '')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [onceDate, setOnceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [noEndDate, setNoEndDate] = useState(true)
  const [pickupTime, setPickupTime] = useState('')
  const [dropoffTime, setDropoffTime] = useState('')

  const toggleDay = (d: number) =>
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())

  const toggleEditDay = (d: number) => {
    setEditState((prev) => {
      if (!prev) return prev
      const days = prev.day_of_week.includes(d)
        ? prev.day_of_week.filter((x) => x !== d)
        : [...prev.day_of_week, d].sort()
      return { ...prev, day_of_week: days }
    })
  }

  const startEdit = (plan: Plan) => {
    const once = isOneTime(plan)
    setEditingId(plan.id)
    setEditState({
      unit_id: plan.unit_id,
      mode: once ? 'once' : 'repeat',
      day_of_week: once ? [1, 2, 3, 4, 5] : [...plan.day_of_week],
      once_date: once ? plan.start_date : new Date().toISOString().slice(0, 10),
      start_date: plan.start_date,
      end_date: plan.end_date ?? '',
      no_end_date: !plan.end_date,
      pickup_time: formatTime(plan.pickup_time),
      dropoff_time: formatTime(plan.dropoff_time),
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditState(null)
  }

  const handleSaveEdit = async (planId: string) => {
    if (!editState) return
    if (editState.mode === 'repeat' && editState.day_of_week.length === 0) return
    setEditSaving(true)

    const isOnce = editState.mode === 'once'
    const dowForOnce = [0, 1, 2, 3, 4, 5, 6] // 日付指定は全曜日OK（期間で絞る）

    const { data, error } = await supabase
      .from('usage_plans')
      .update({
        unit_id: editState.unit_id,
        day_of_week: isOnce ? dowForOnce : editState.day_of_week,
        start_date: isOnce ? editState.once_date : editState.start_date,
        end_date: isOnce ? editState.once_date : (editState.no_end_date ? null : (editState.end_date || null)),
        pickup_time: editState.pickup_time || null,
        dropoff_time: editState.dropoff_time || null,
      })
      .eq('id', planId)
      .select('id, unit_id, day_of_week, start_date, end_date, is_active, pickup_time, dropoff_time, units(name)')
      .single()
    setEditSaving(false)
    if (error) return
    if (data) {
      setPlans((prev) => prev.map((p) => p.id === planId ? data as unknown as Plan : p))
      setEditingId(null)
      setEditState(null)
      startTransition(() => router.refresh())
    }
  }

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
    if (!selectedUnit) return
    if (addMode === 'repeat' && selectedDays.length === 0) return
    setSaving(true)
    setSaveError(null)

    const isOnce = addMode === 'once'
    const { data, error } = await supabase
      .from('usage_plans')
      .insert({
        child_id: childId,
        unit_id: selectedUnit,
        day_of_week: isOnce ? [0, 1, 2, 3, 4, 5, 6] : selectedDays,
        start_date: isOnce ? onceDate : startDate,
        end_date: isOnce ? onceDate : (noEndDate ? null : (endDate || null)),
        is_active: true,
        pickup_time: pickupTime || null,
        dropoff_time: dropoffTime || null,
      })
      .select('id, unit_id, day_of_week, start_date, end_date, is_active, pickup_time, dropoff_time, units(name)')
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
      setAddMode('repeat')
      setSelectedDays([1, 2, 3, 4, 5])
      setOnceDate(new Date().toISOString().slice(0, 10))
      setStartDate(new Date().toISOString().slice(0, 10))
      setEndDate('')
      setNoEndDate(true)
      setPickupTime('')
      setDropoffTime('')
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

  const timeInputs = (
    pt: string, setPt: (v: string) => void,
    dt: string, setDt: (v: string) => void
  ) => (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-2 block">
        送迎時間
        <span className="ml-1 text-gray-400 font-normal">（1時間単位で便が自動的に分かれます）</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
            お迎え時間
          </label>
          <input type="time" value={pt} onChange={(e) => setPt(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-400" />
            お送り時間
          </label>
          <input type="time" value={dt} onChange={(e) => setDt(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* 既存プラン一覧 */}
      {plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((plan) =>
            editingId === plan.id && editState ? (
              /* 編集フォーム */
              <Card key={plan.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    スケジュールを編集
                    <button onClick={cancelEdit} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                      <X className="h-4 w-4" />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* ユニット */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">ユニット</label>
                    <select
                      value={editState.unit_id}
                      onChange={(e) => setEditState((p) => p ? { ...p, unit_id: e.target.value } : p)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  {/* モード切替 */}
                  <div className="flex gap-2">
                    {([['repeat', '繰り返し', Repeat], ['once', '日付指定', CalendarDays]] as const).map(([m, label, Icon]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditState((p) => p ? { ...p, mode: m } : p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          editState.mode === m
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {editState.mode === 'once' ? (
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">日付</label>
                      <input
                        type="date"
                        value={editState.once_date}
                        onChange={(e) => setEditState((p) => p ? { ...p, once_date: e.target.value } : p)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-2 block">繰り返す曜日</label>
                        <div className="flex gap-2">
                          {DAY_LABELS.map((label, d) => (
                            <button key={d} type="button" onClick={() => toggleEditDay(d)}
                              className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors ${
                                editState.day_of_week.includes(d)
                                  ? DAY_COLORS[d] + ' border-current'
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {editState.day_of_week.length === 0 && (
                          <p className="text-xs text-red-500 mt-1">曜日を1つ以上選択してください</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">開始日</label>
                          <input type="date" value={editState.start_date}
                            onChange={(e) => setEditState((p) => p ? { ...p, start_date: e.target.value } : p)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">終了日</label>
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input type="checkbox" checked={editState.no_end_date}
                                onChange={(e) => setEditState((p) => p ? { ...p, no_end_date: e.target.checked } : p)}
                                className="rounded" />
                              終了日を設定しない
                            </label>
                            {!editState.no_end_date && (
                              <input type="date" value={editState.end_date} min={editState.start_date}
                                onChange={(e) => setEditState((p) => p ? { ...p, end_date: e.target.value } : p)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {timeInputs(
                    editState.pickup_time,
                    (v) => setEditState((p) => p ? { ...p, pickup_time: v } : p),
                    editState.dropoff_time,
                    (v) => setEditState((p) => p ? { ...p, dropoff_time: v } : p),
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={cancelEdit}>キャンセル</Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(plan.id)}
                      disabled={editSaving || (editState.mode === 'repeat' && editState.day_of_week.length === 0)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {editSaving ? '保存中...' : '保存する'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* 表示カード */
              <Card key={plan.id} className={plan.is_active ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{plan.units?.name ?? '—'}</span>
                        {isOneTime(plan) && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <CalendarDays className="h-3 w-3" />
                            日付指定
                          </span>
                        )}
                        <Badge variant={plan.is_active ? 'success' : 'secondary'} className="text-xs">
                          {plan.is_active ? '有効' : '無効'}
                        </Badge>
                      </div>

                      {isOneTime(plan) ? (
                        <p className="text-sm font-medium text-gray-700">{formatDate(plan.start_date)}</p>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap">
                          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                            <span key={d}
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border ${
                                plan.day_of_week.includes(d) ? DAY_COLORS[d] : 'bg-gray-100 text-gray-300 border-gray-200'
                              }`}
                            >
                              {DAY_LABELS[d]}
                            </span>
                          ))}
                        </div>
                      )}

                      {(plan.pickup_time || plan.dropoff_time) && (
                        <div className="flex gap-3 flex-wrap">
                          {plan.pickup_time && (
                            <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                              <Clock className="h-3 w-3" />お迎え {formatTime(plan.pickup_time)}
                            </span>
                          )}
                          {plan.dropoff_time && (
                            <span className="flex items-center gap-1 text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                              <Clock className="h-3 w-3" />お送り {formatTime(plan.dropoff_time)}
                            </span>
                          )}
                        </div>
                      )}

                      {!isOneTime(plan) && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <CalendarRange className="h-3.5 w-3.5" />
                          {formatDate(plan.start_date)} 〜 {plan.end_date ? formatDate(plan.end_date) : '終了日なし'}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button onClick={() => startEdit(plan)} title="編集"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleToggleActive(plan)}
                        title={plan.is_active ? '無効にする' : '有効にする'}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <Power className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(plan.id)} title="削除"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
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
            {/* ユニット */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">ユニット</label>
              <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* モード切替 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">追加方法</label>
              <div className="flex gap-2">
                {([['repeat', '繰り返し', Repeat], ['once', '日付指定', CalendarDays]] as const).map(([m, label, Icon]) => (
                  <button key={m} type="button" onClick={() => setAddMode(m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      addMode === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {addMode === 'once' ? (
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">日付</label>
                <input type="date" value={onceDate} onChange={(e) => setOnceDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">繰り返す曜日</label>
                  <div className="flex gap-2">
                    {DAY_LABELS.map((label, d) => (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">開始日</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">終了日</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="rounded" />
                        終了日を設定しない
                      </label>
                      {!noEndDate && (
                        <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 -mt-1">
                  曜日によって時間が異なる場合は、その曜日だけ別のスケジュールとして追加してください
                </p>
              </>
            )}

            {timeInputs(pickupTime, setPickupTime, dropoffTime, setDropoffTime)}

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
                disabled={saving || !selectedUnit || (addMode === 'repeat' && selectedDays.length === 0)}
              >
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" className="w-full border-dashed" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          スケジュールを追加
        </Button>
      )}
    </div>
  )
}
