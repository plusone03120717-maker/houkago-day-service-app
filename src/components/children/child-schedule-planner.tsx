'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Power, CalendarRange, Clock, Pencil, X, Check, CalendarDays, Repeat, Car, ChevronDown, RotateCcw } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Unit = { id: string; name: string; service_type: string }
type Plan = {
  id: string
  name: string | null
  unit_id: string
  day_of_week: number[]
  start_date: string
  end_date: string | null
  is_active: boolean
  pickup_time: string | null
  dropoff_time: string | null
  transport_type: string
  pickup_location_type: string
  units: { name: string } | null
}
type DaySetting = {
  id: string
  plan_id: string
  day_of_week: number
  transport_type: string
  pickup_location_type: string
  pickup_time: string | null
  dropoff_time: string | null
}

type DateOverride = {
  id: string
  plan_id: string
  date: string
  transport_type: string
  pickup_location_type: string
  pickup_time: string | null
  dropoff_time: string | null
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

const TRANSPORT_OPTIONS = [
  { value: 'none',         label: '送迎なし',      color: 'bg-gray-100 text-gray-600' },
  { value: 'pickup_only',  label: '行きのみ',      color: 'bg-indigo-100 text-indigo-700' },
  { value: 'dropoff_only', label: '帰りのみ',      color: 'bg-teal-100 text-teal-700' },
  { value: 'both',         label: '行き・帰り両方', color: 'bg-purple-100 text-purple-700' },
] as const

function formatTime(time: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

function transportLabel(type: string) {
  return TRANSPORT_OPTIONS.find((o) => o.value === type) ?? TRANSPORT_OPTIONS[3]
}

/** 9:00〜18:00 を30分刻みで生成 */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts = []
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) break
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      opts.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` })
    }
  }
  return opts
})()

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
      <option value="">未設定</option>
      {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** start_date === end_date なら日付指定の一回のみ */
function isOneTime(plan: Plan): boolean {
  return !!plan.end_date && plan.start_date === plan.end_date
}

interface EditState {
  name: string
  unit_id: string
  mode: 'repeat' | 'once'
  day_of_week: number[]
  once_date: string
  start_date: string
  end_date: string
  no_end_date: boolean
  pickup_time: string
  dropoff_time: string
  transport_type: string
  pickup_location_type: string
}

interface DayEditState {
  transport_type: string
  pickup_location_type: string
  pickup_time: string
  dropoff_time: string
}

interface DateOverrideEditState {
  transport_type: string
  pickup_location_type: string
  pickup_time: string
  dropoff_time: string
}

interface Props {
  childId: string
  childName: string
  childAddress: string | null
  schoolName: string | null
  units: Unit[]
  initialPlans: Plan[]
  initialDaySettings: DaySetting[]
  initialDateOverrides: DateOverride[]
  defaultTransportType: string
  defaultPickupLocationType: string
}

export function ChildSchedulePlanner({
  childId, units, initialPlans, initialDaySettings, initialDateOverrides,
  childAddress, schoolName,
  defaultTransportType, defaultPickupLocationType,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  const [plans, setPlans] = useState<Plan[]>(initialPlans)
  const [daySettings, setDaySettings] = useState<DaySetting[]>(initialDaySettings)
  const [dateOverrides, setDateOverrides] = useState<DateOverride[]>(initialDateOverrides)

  // 特定日上書き: どの計画の追加フォームを開いているか
  const [openDateOverridePlanId, setOpenDateOverridePlanId] = useState<string | null>(null)
  // 編集中の上書きID（null = 新規）
  const [editingDateOverrideId, setEditingDateOverrideId] = useState<string | null>(null)
  const [dateOverrideDate, setDateOverrideDate] = useState('')
  const [dateOverrideEditState, setDateOverrideEditState] = useState<DateOverrideEditState | null>(null)
  const [dateOverrideSaving, setDateOverrideSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // 曜日別編集: どの計画のどの曜日を開いているか
  const [openDayKey, setOpenDayKey] = useState<string | null>(null) // `${planId}-${dow}`
  const [dayEditState, setDayEditState] = useState<DayEditState | null>(null)
  const [daySaving, setDaySaving] = useState(false)

  // 新規追加フォーム状態
  const [planName, setPlanName] = useState('')
  const [addMode, setAddMode] = useState<'repeat' | 'once'>('repeat')
  const [selectedUnit, setSelectedUnit] = useState(units[0]?.id ?? '')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [onceDate, setOnceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [noEndDate, setNoEndDate] = useState(true)
  const [pickupTime, setPickupTime] = useState('')
  const [dropoffTime, setDropoffTime] = useState('')
  const [transportType, setTransportType] = useState(defaultTransportType)
  const [pickupLocationType, setPickupLocationType] = useState(defaultPickupLocationType)

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

  // 曜日別設定を取得（なければnull）
  const getDaySetting = (planId: string, dow: number): DaySetting | null =>
    daySettings.find((ds) => ds.plan_id === planId && ds.day_of_week === dow) ?? null

  // 曜日別設定パネルを開く
  const openDayEdit = (plan: Plan, dow: number) => {
    const key = `${plan.id}-${dow}`
    if (openDayKey === key) {
      setOpenDayKey(null)
      setDayEditState(null)
      return
    }
    const existing = getDaySetting(plan.id, dow)
    setOpenDayKey(key)
    setDayEditState({
      transport_type: existing?.transport_type ?? plan.transport_type,
      pickup_location_type: existing?.pickup_location_type ?? plan.pickup_location_type,
      pickup_time: formatTime(existing?.pickup_time ?? plan.pickup_time),
      dropoff_time: formatTime(existing?.dropoff_time ?? plan.dropoff_time),
    })
  }

  // 曜日別設定を保存（upsert）
  const handleSaveDaySetting = async (plan: Plan, dow: number) => {
    if (!dayEditState) return
    setDaySaving(true)
    const existing = getDaySetting(plan.id, dow)

    if (existing) {
      const { data, error } = await supabase
        .from('usage_plan_day_settings')
        .update({
          transport_type: dayEditState.transport_type,
          pickup_location_type: dayEditState.pickup_location_type,
          pickup_time: dayEditState.pickup_time || null,
          dropoff_time: dayEditState.dropoff_time || null,
        })
        .eq('id', existing.id)
        .select('id, plan_id, day_of_week, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .single()
      setDaySaving(false)
      if (!error && data) {
        setDaySettings((prev) => prev.map((ds) => ds.id === existing.id ? data as unknown as DaySetting : ds))
        setOpenDayKey(null)
        setDayEditState(null)
      }
    } else {
      const { data, error } = await supabase
        .from('usage_plan_day_settings')
        .insert({
          plan_id: plan.id,
          day_of_week: dow,
          transport_type: dayEditState.transport_type,
          pickup_location_type: dayEditState.pickup_location_type,
          pickup_time: dayEditState.pickup_time || null,
          dropoff_time: dayEditState.dropoff_time || null,
        })
        .select('id, plan_id, day_of_week, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .single()
      setDaySaving(false)
      if (!error && data) {
        setDaySettings((prev) => [...prev, data as unknown as DaySetting])
        setOpenDayKey(null)
        setDayEditState(null)
      }
    }
  }

  // 曜日別設定をリセット（デフォルトに戻す）
  const handleResetDaySetting = async (plan: Plan, dow: number) => {
    const existing = getDaySetting(plan.id, dow)
    if (!existing) return
    await supabase.from('usage_plan_day_settings').delete().eq('id', existing.id)
    setDaySettings((prev) => prev.filter((ds) => ds.id !== existing.id))
    setOpenDayKey(null)
    setDayEditState(null)
  }

  // 特定日上書き: 追加/編集フォームを開く
  const openDateOverrideForm = (plan: Plan, override?: DateOverride) => {
    if (openDateOverridePlanId === plan.id && editingDateOverrideId === (override?.id ?? null)) {
      setOpenDateOverridePlanId(null)
      setEditingDateOverrideId(null)
      setDateOverrideEditState(null)
      return
    }
    setOpenDateOverridePlanId(plan.id)
    setEditingDateOverrideId(override?.id ?? null)
    setDateOverrideDate(override?.date ?? '')
    setDateOverrideEditState({
      transport_type: override?.transport_type ?? plan.transport_type,
      pickup_location_type: override?.pickup_location_type ?? plan.pickup_location_type,
      pickup_time: formatTime(override?.pickup_time ?? plan.pickup_time),
      dropoff_time: formatTime(override?.dropoff_time ?? plan.dropoff_time),
    })
    // 曜日別パネルは閉じる
    setOpenDayKey(null)
    setDayEditState(null)
  }

  const closeDateOverrideForm = () => {
    setOpenDateOverridePlanId(null)
    setEditingDateOverrideId(null)
    setDateOverrideDate('')
    setDateOverrideEditState(null)
  }

  const handleSaveDateOverride = async (planId: string) => {
    if (!dateOverrideEditState || !dateOverrideDate) return
    setDateOverrideSaving(true)

    if (editingDateOverrideId) {
      const { data, error } = await supabase
        .from('usage_plan_date_overrides')
        .update({
          date: dateOverrideDate,
          transport_type: dateOverrideEditState.transport_type,
          pickup_location_type: dateOverrideEditState.pickup_location_type,
          pickup_time: dateOverrideEditState.pickup_time || null,
          dropoff_time: dateOverrideEditState.dropoff_time || null,
        })
        .eq('id', editingDateOverrideId)
        .select('id, plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .single()
      setDateOverrideSaving(false)
      if (!error && data) {
        setDateOverrides((prev) => prev.map((o) => o.id === editingDateOverrideId ? data as unknown as DateOverride : o))
        closeDateOverrideForm()
      }
    } else {
      const { data, error } = await supabase
        .from('usage_plan_date_overrides')
        .insert({
          plan_id: planId,
          date: dateOverrideDate,
          transport_type: dateOverrideEditState.transport_type,
          pickup_location_type: dateOverrideEditState.pickup_location_type,
          pickup_time: dateOverrideEditState.pickup_time || null,
          dropoff_time: dateOverrideEditState.dropoff_time || null,
        })
        .select('id, plan_id, date, transport_type, pickup_location_type, pickup_time, dropoff_time')
        .single()
      setDateOverrideSaving(false)
      if (!error && data) {
        setDateOverrides((prev) => [...prev, data as unknown as DateOverride])
        closeDateOverrideForm()
      }
    }
  }

  const handleDeleteDateOverride = async (overrideId: string) => {
    await supabase.from('usage_plan_date_overrides').delete().eq('id', overrideId)
    setDateOverrides((prev) => prev.filter((o) => o.id !== overrideId))
    if (editingDateOverrideId === overrideId) closeDateOverrideForm()
  }

  const startEdit = (plan: Plan) => {
    const once = isOneTime(plan)
    setEditingId(plan.id)
    setEditState({
      name: plan.name ?? '',
      unit_id: plan.unit_id,
      mode: once ? 'once' : 'repeat',
      day_of_week: once ? [1, 2, 3, 4, 5] : [...plan.day_of_week],
      once_date: once ? plan.start_date : new Date().toISOString().slice(0, 10),
      start_date: plan.start_date,
      end_date: plan.end_date ?? '',
      no_end_date: !plan.end_date,
      pickup_time: formatTime(plan.pickup_time),
      dropoff_time: formatTime(plan.dropoff_time),
      transport_type: plan.transport_type,
      pickup_location_type: plan.pickup_location_type,
    })
    setOpenDayKey(null)
    setDayEditState(null)
  }

  const cancelEdit = () => { setEditingId(null); setEditState(null) }

  const handleSaveEdit = async (planId: string) => {
    if (!editState) return
    if (editState.mode === 'repeat' && editState.day_of_week.length === 0) return
    setEditSaving(true)
    const isOnce = editState.mode === 'once'
    const { data, error } = await supabase
      .from('usage_plans')
      .update({
        name: editState.name || null,
        unit_id: editState.unit_id,
        day_of_week: isOnce ? [0, 1, 2, 3, 4, 5, 6] : editState.day_of_week,
        start_date: isOnce ? editState.once_date : editState.start_date,
        end_date: isOnce ? editState.once_date : (editState.no_end_date ? null : (editState.end_date || null)),
        pickup_time: editState.pickup_time || null,
        dropoff_time: editState.dropoff_time || null,
        transport_type: editState.transport_type,
        pickup_location_type: editState.pickup_location_type,
      })
      .eq('id', planId)
      .select('id, name, unit_id, day_of_week, start_date, end_date, is_active, pickup_time, dropoff_time, transport_type, pickup_location_type, units(name)')
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
    await Promise.all(months.map((month) =>
      fetch('/api/usage-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, month }),
      })
    ))
  }

  const handleAdd = async () => {
    if (!selectedUnit) return
    if (addMode === 'repeat' && selectedDays.length === 0) return
    setSaving(true)
    setSaveError(null)
    const isOnce = addMode === 'once'
    const autoName = planName.trim() || `スケジュール${plans.length + 1}`
    const { data, error } = await supabase
      .from('usage_plans')
      .insert({
        child_id: childId,
        name: autoName,
        unit_id: selectedUnit,
        day_of_week: isOnce ? [0, 1, 2, 3, 4, 5, 6] : selectedDays,
        start_date: isOnce ? onceDate : startDate,
        end_date: isOnce ? onceDate : (noEndDate ? null : (endDate || null)),
        is_active: true,
        pickup_time: pickupTime || null,
        dropoff_time: dropoffTime || null,
        transport_type: transportType,
        pickup_location_type: pickupLocationType,
      })
      .select('id, name, unit_id, day_of_week, start_date, end_date, is_active, pickup_time, dropoff_time, transport_type, pickup_location_type, units(name)')
      .single()
    if (error) { setSaving(false); setSaveError(error.message); return }
    if (data) {
      await autoGenerateReservations(data.id)
      setSaving(false)
      setPlans((prev) => [data as unknown as Plan, ...prev])
      setShowForm(false)
      setPlanName('')
      setAddMode('repeat'); setSelectedDays([1, 2, 3, 4, 5])
      setOnceDate(new Date().toISOString().slice(0, 10))
      setStartDate(new Date().toISOString().slice(0, 10))
      setEndDate(''); setNoEndDate(true)
      setPickupTime(''); setDropoffTime('')
      setTransportType(defaultTransportType)
      setPickupLocationType(defaultPickupLocationType)
      startTransition(() => router.refresh())
    }
  }

  const handleToggleActive = async (plan: Plan) => {
    // プランを無効化する場合、今日以降の予約をキャンセルして送迎スケジュールに反映されないようにする
    if (plan.is_active) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase
        .from('usage_reservations')
        .update({ status: 'cancelled' })
        .eq('child_id', plan.child_id)
        .eq('unit_id', plan.unit_id)
        .gte('date', today)
        .in('status', ['confirmed', 'reserved'])
    }
    await supabase.from('usage_plans').update({ is_active: !plan.is_active }).eq('id', plan.id)
    setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, is_active: !p.is_active } : p))
  }

  const handleDelete = async (planId: string) => {
    if (!confirm('このスケジュールを削除しますか？')) return
    await supabase.from('usage_plans').delete().eq('id', planId)
    setPlans((prev) => prev.filter((p) => p.id !== planId))
    setDaySettings((prev) => prev.filter((ds) => ds.plan_id !== planId))
  }

  /** 送迎区分・お迎え場所の選択UI */
  const transportInputs = (
    tt: string, setTt: (v: string) => void,
    plt: string, setPlt: (v: string) => void
  ) => (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700 mb-2 block">送迎</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TRANSPORT_OPTIONS.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setTt(value)}
              className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                tt === value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {(tt === 'pickup_only' || tt === 'both') && (
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">
            お迎え場所
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPlt('home')}
              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                plt === 'home'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              自宅{childAddress ? `（${childAddress.slice(0, 10)}…）` : ''}
            </button>
            {schoolName && (
              <button type="button" onClick={() => setPlt('school')}
                className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  plt === 'school'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                学校（{schoolName}）
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )

  /** 利用時間の選択UI */
  const timeInputs = (
    pt: string, setPt: (v: string) => void,
    dt: string, setDt: (v: string) => void
  ) => (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-2 block">
        利用時間
        <span className="ml-1 text-gray-400 font-normal">（1時間単位でお迎え便が自動的に分かれます）</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />開始時間
          </label>
          <TimeSelect value={pt} onChange={setPt} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-teal-400" />終了時間
          </label>
          <TimeSelect value={dt} onChange={setDt} />
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
                  {/* 名前 */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">スケジュール名</label>
                    <input type="text" value={editState.name}
                      onChange={(e) => setEditState((p) => p ? { ...p, name: e.target.value } : p)}
                      placeholder="例: 平日スケジュール"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>

                  {/* ユニット */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">ユニット</label>
                    <select value={editState.unit_id}
                      onChange={(e) => setEditState((p) => p ? { ...p, unit_id: e.target.value } : p)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  {/* モード切替 */}
                  <div className="flex gap-2">
                    {([['repeat', '繰り返し', Repeat], ['once', '日付指定', CalendarDays]] as const).map(([m, label, Icon]) => (
                      <button key={m} type="button"
                        onClick={() => setEditState((p) => p ? { ...p, mode: m } : p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          editState.mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}>
                        <Icon className="h-3.5 w-3.5" />{label}
                      </button>
                    ))}
                  </div>

                  {editState.mode === 'once' ? (
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">日付</label>
                      <input type="date" value={editState.once_date}
                        onChange={(e) => setEditState((p) => p ? { ...p, once_date: e.target.value } : p)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-2 block">繰り返す曜日</label>
                        <div className="flex gap-2">
                          {DAY_LABELS.map((label, d) => (
                            <button key={d} type="button" onClick={() => toggleEditDay(d)}
                              className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors ${
                                editState.day_of_week.includes(d) ? DAY_COLORS[d] + ' border-current' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                              }`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {editState.day_of_week.length === 0 && <p className="text-xs text-red-500 mt-1">曜日を1つ以上選択してください</p>}
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

                  {transportInputs(
                    editState.transport_type,
                    (v) => setEditState((p) => p ? { ...p, transport_type: v } : p),
                    editState.pickup_location_type,
                    (v) => setEditState((p) => p ? { ...p, pickup_location_type: v } : p),
                  )}

                  {timeInputs(
                    editState.pickup_time,
                    (v) => setEditState((p) => p ? { ...p, pickup_time: v } : p),
                    editState.dropoff_time,
                    (v) => setEditState((p) => p ? { ...p, dropoff_time: v } : p),
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={cancelEdit}>キャンセル</Button>
                    <Button size="sm" onClick={() => handleSaveEdit(plan.id)}
                      disabled={editSaving || (editState.mode === 'repeat' && editState.day_of_week.length === 0)}>
                      <Check className="h-3.5 w-3.5" />
                      {editSaving ? '保存中...' : '保存する'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* 表示カード */
              <Card key={plan.id} className={plan.is_active ? '' : 'opacity-60'}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{plan.name ?? `スケジュール`}</span>
                        <span className="text-xs text-gray-400">{plan.units?.name ?? '—'}</span>
                        {isOneTime(plan) && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <CalendarDays className="h-3 w-3" />日付指定
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
                          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                            const active = plan.day_of_week.includes(d)
                            const hasOverride = active && !!getDaySetting(plan.id, d)
                            return (
                              <div key={d} className="relative">
                                <button
                                  type="button"
                                  onClick={() => active ? openDayEdit(plan, d) : undefined}
                                  className={`inline-flex flex-col items-center justify-center w-9 h-9 rounded-full text-xs font-bold border transition-colors ${
                                    active
                                      ? `${DAY_COLORS[d]} hover:opacity-80 cursor-pointer`
                                      : 'bg-gray-100 text-gray-300 border-gray-200 cursor-default'
                                  }`}
                                  title={active ? `${DAY_LABELS[d]}曜日の設定を編集` : undefined}
                                >
                                  {DAY_LABELS[d]}
                                </button>
                                {hasOverride && (
                                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orange-400" title="個別設定あり" />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* 送迎バッジ（全体デフォルト） */}
                      <div className="flex gap-2 flex-wrap items-center">
                        <span className="text-xs text-gray-400">デフォルト:</span>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${transportLabel(plan.transport_type).color}`}>
                          <Car className="h-3 w-3" />
                          {transportLabel(plan.transport_type).label}
                          {(plan.transport_type === 'pickup_only' || plan.transport_type === 'both') && (
                            <span className="ml-0.5 opacity-75">
                              （{plan.pickup_location_type === 'school' ? '学校' : '自宅'}から）
                            </span>
                          )}
                        </span>
                        {plan.pickup_time && (
                          <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" />開始 {formatTime(plan.pickup_time)}
                          </span>
                        )}
                        {plan.dropoff_time && (
                          <span className="flex items-center gap-1 text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" />終了 {formatTime(plan.dropoff_time)}
                          </span>
                        )}
                      </div>

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

                  {/* 曜日別設定パネル */}
                  {!isOneTime(plan) && plan.day_of_week.map((dow) => {
                    const key = `${plan.id}-${dow}`
                    const isOpen = openDayKey === key
                    if (!isOpen) return null
                    const existing = getDaySetting(plan.id, dow)
                    return (
                      <div key={key} className="border border-indigo-200 rounded-xl bg-indigo-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${DAY_COLORS[dow]}`}>
                              {DAY_LABELS[dow]}
                            </span>
                            <span className="text-sm font-medium text-gray-700">曜日の設定</span>
                            {existing && (
                              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">個別設定中</span>
                            )}
                          </div>
                          <button onClick={() => { setOpenDayKey(null); setDayEditState(null) }}
                            className="p-1 rounded hover:bg-indigo-100 text-gray-400">
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {dayEditState && (
                          <>
                            {transportInputs(
                              dayEditState.transport_type,
                              (v) => setDayEditState((p) => p ? { ...p, transport_type: v } : p),
                              dayEditState.pickup_location_type,
                              (v) => setDayEditState((p) => p ? { ...p, pickup_location_type: v } : p),
                            )}
                            {timeInputs(
                              dayEditState.pickup_time,
                              (v) => setDayEditState((p) => p ? { ...p, pickup_time: v } : p),
                              dayEditState.dropoff_time,
                              (v) => setDayEditState((p) => p ? { ...p, dropoff_time: v } : p),
                            )}
                            <div className="flex gap-2 pt-1">
                              {existing && (
                                <Button variant="outline" size="sm"
                                  onClick={() => handleResetDaySetting(plan, dow)}
                                  className="text-gray-500">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  デフォルトに戻す
                                </Button>
                              )}
                              <Button size="sm" onClick={() => handleSaveDaySetting(plan, dow)} disabled={daySaving}>
                                <Check className="h-3.5 w-3.5" />
                                {daySaving ? '保存中...' : '保存する'}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}

                  {/* 曜日別設定の概要（上書きがある曜日の一覧） */}
                  {!isOneTime(plan) && daySettings.some((ds) => ds.plan_id === plan.id) && (
                    <div className="pt-1 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1.5">曜日別の個別設定</p>
                      <div className="flex flex-wrap gap-2">
                        {daySettings
                          .filter((ds) => ds.plan_id === plan.id)
                          .sort((a, b) => a.day_of_week - b.day_of_week)
                          .map((ds) => (
                            <button key={ds.id} type="button"
                              onClick={() => openDayEdit(plan, ds.day_of_week)}
                              className="flex items-center gap-1.5 text-xs bg-white border border-orange-200 rounded-lg px-2 py-1 hover:bg-orange-50 transition-colors">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${DAY_COLORS[ds.day_of_week]}`}>
                                {DAY_LABELS[ds.day_of_week]}
                              </span>
                              <span className="text-orange-700">{transportLabel(ds.transport_type).label}</span>
                              {ds.pickup_time && <span className="text-gray-500">{formatTime(ds.pickup_time)}</span>}
                              <ChevronDown className="h-3 w-3 text-gray-400" />
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* 特定日上書き設定 */}
                  {!isOneTime(plan) && (
                    <div className="pt-1 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-gray-400">特定日の変更</p>
                        <button type="button"
                          onClick={() => openDateOverrideForm(plan)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors">
                          <Plus className="h-3 w-3" />追加
                        </button>
                      </div>

                      {/* 既存の特定日上書き一覧 */}
                      {dateOverrides.filter((o) => o.plan_id === plan.id).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {dateOverrides
                            .filter((o) => o.plan_id === plan.id)
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((override) => (
                              <button key={override.id} type="button"
                                onClick={() => openDateOverrideForm(plan, override)}
                                className="flex items-center gap-1.5 text-xs bg-white border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-50 transition-colors">
                                <CalendarDays className="h-3 w-3 text-purple-500" />
                                <span className="text-purple-700 font-medium">{override.date}</span>
                                <span className="text-gray-500">{transportLabel(override.transport_type).label}</span>
                                <ChevronDown className="h-3 w-3 text-gray-400" />
                              </button>
                            ))}
                        </div>
                      )}

                      {/* 追加/編集フォーム */}
                      {openDateOverridePlanId === plan.id && dateOverrideEditState && (
                        <div className="border border-purple-200 rounded-xl bg-purple-50 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {editingDateOverrideId ? '特定日の変更を編集' : '特定日の変更を追加'}
                            </span>
                            <button onClick={closeDateOverrideForm}
                              className="p-1 rounded hover:bg-purple-100 text-gray-400">
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-gray-700 mb-1 block">対象日</label>
                            <input type="date" value={dateOverrideDate}
                              onChange={(e) => setDateOverrideDate(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>

                          {transportInputs(
                            dateOverrideEditState.transport_type,
                            (v) => setDateOverrideEditState((p) => p ? { ...p, transport_type: v } : p),
                            dateOverrideEditState.pickup_location_type,
                            (v) => setDateOverrideEditState((p) => p ? { ...p, pickup_location_type: v } : p),
                          )}
                          {timeInputs(
                            dateOverrideEditState.pickup_time,
                            (v) => setDateOverrideEditState((p) => p ? { ...p, pickup_time: v } : p),
                            dateOverrideEditState.dropoff_time,
                            (v) => setDateOverrideEditState((p) => p ? { ...p, dropoff_time: v } : p),
                          )}

                          <div className="flex gap-2 pt-1">
                            {editingDateOverrideId && (
                              <Button variant="outline" size="sm"
                                onClick={() => handleDeleteDateOverride(editingDateOverrideId)}
                                className="text-red-500 hover:text-red-700">
                                <Trash2 className="h-3.5 w-3.5" />削除
                              </Button>
                            )}
                            <Button size="sm"
                              onClick={() => handleSaveDateOverride(plan.id)}
                              disabled={dateOverrideSaving || !dateOverrideDate}>
                              <Check className="h-3.5 w-3.5" />
                              {dateOverrideSaving ? '保存中...' : '保存する'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
            {/* 名前 */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">スケジュール名</label>
              <input type="text" value={planName} onChange={(e) => setPlanName(e.target.value)}
                placeholder={`スケジュール${plans.length + 1}`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>

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
                      addMode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    <Icon className="h-3.5 w-3.5" />{label}
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
                          selectedDays.includes(d) ? DAY_COLORS[d] + ' border-current' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {selectedDays.length === 0 && <p className="text-xs text-red-500 mt-1">曜日を1つ以上選択してください</p>}
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
              </>
            )}

            {transportInputs(transportType, setTransportType, pickupLocationType, setPickupLocationType)}
            {timeInputs(pickupTime, setPickupTime, dropoffTime, setDropoffTime)}

            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                エラー: {saveError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>キャンセル</Button>
              <Button size="sm" onClick={handleAdd}
                disabled={saving || !selectedUnit || (addMode === 'repeat' && selectedDays.length === 0)}>
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
