'use client'

import { useState } from 'react'
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import {
  DEFAULT_HOURS_PER_DAY,
  HOURLY_LEAVE_LIMIT_DAYS,
  MANDATORY_LEAVE_DAYS,
  MANDATORY_LEAVE_THRESHOLD_DAYS,
  formatDayHours,
  formatUsedLabel,
  hourlyLimitHours,
  isInFiscalYear,
  remainingHours,
  sumDayUnitDays,
  sumHourUnitHours,
  usageLabel,
} from '@/lib/paid-leave'

export type StaffUser = {
  id: string
  name: string
  paid_leave_hours_per_day: number | null
}

export type LeaveGrant = {
  id: string
  staff_id: string
  year: number
  total_days: number
  note: string | null
}

export type LeaveUsage = {
  id: string
  staff_id: string
  date: string
  unit: string | null
  days_used: number
  hours_used: number | null
  note: string | null
}

type Props = {
  staffList: StaffUser[]
  initialGrants: LeaveGrant[]
  initialUsages: LeaveUsage[]
  initialYear: number
}

export function PaidLeaveBoard({ staffList, initialGrants, initialUsages, initialYear }: Props) {
  const [year, setYear] = useState(initialYear)
  const [grants, setGrants] = useState<LeaveGrant[]>(initialGrants)
  const [usages, setUsages] = useState<LeaveUsage[]>(initialUsages)
  const [staff, setStaff] = useState<StaffUser[]>(staffList)
  const [selectedStaffId, setSelectedStaffId] = useState(staffList[0]?.id ?? '')

  // Grant form state
  const [editingGrant, setEditingGrant] = useState(false)
  const [grantDays, setGrantDays] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [grantHoursPerDay, setGrantHoursPerDay] = useState('')
  const [savingGrant, setSavingGrant] = useState(false)

  // Usage form state
  const [showUsageForm, setShowUsageForm] = useState(false)
  const [usageDate, setUsageDate] = useState('')
  const [usageUnit, setUsageUnit] = useState<'1.0' | '0.5' | 'hour'>('1.0')
  const [usageHours, setUsageHours] = useState('1')
  const [usageNote, setUsageNote] = useState('')
  const [savingUsage, setSavingUsage] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selectedStaff = staff.find((s) => s.id === selectedStaffId)
  const hoursPerDay = selectedStaff?.paid_leave_hours_per_day ?? DEFAULT_HOURS_PER_DAY

  const currentGrant = grants.find((g) => g.staff_id === selectedStaffId && g.year === year)
  const currentUsages = usages
    .filter((u) => u.staff_id === selectedStaffId && isInFiscalYear(u.date, year))
    .sort((a, b) => a.date.localeCompare(b.date))

  const usedDays = sumDayUnitDays(currentUsages)
  const usedHours = sumHourUnitHours(currentUsages)
  const remaining = remainingHours(currentGrant?.total_days ?? 0, currentUsages, hoursPerDay)

  // 時間単位年休は年5日分が上限（労基法39条4項）
  const hourlyLimit = hourlyLimitHours(hoursPerDay)
  const hourlyRemaining = hourlyLimit - usedHours

  // 年5日の時季指定義務（年10日以上付与された者が対象・時間単位は充当できない）
  const mandatoryTarget = (currentGrant?.total_days ?? 0) >= MANDATORY_LEAVE_THRESHOLD_DAYS
  const mandatoryShortage = Math.max(0, MANDATORY_LEAVE_DAYS - usedDays)

  async function fetchData(staffId: string, yr: number) {
    const res = await fetch(`/api/staff/paid-leave?staff_id=${staffId}&year=${yr}`)
    if (!res.ok) return
    const json = await res.json() as { grants: LeaveGrant[]; usages: LeaveUsage[]; hoursPerDay: number }
    setGrants((prev) => {
      const filtered = prev.filter((g) => !(g.staff_id === staffId && g.year === yr))
      return [...filtered, ...json.grants]
    })
    setUsages((prev) => {
      const filtered = prev.filter((u) => !(u.staff_id === staffId && isInFiscalYear(u.date, yr)))
      return [...filtered, ...json.usages]
    })
    setStaff((prev) => prev.map((s) => (
      s.id === staffId ? { ...s, paid_leave_hours_per_day: json.hoursPerDay } : s
    )))
  }

  function handleStaffChange(id: string) {
    setSelectedStaffId(id)
    setEditingGrant(false)
    setShowUsageForm(false)
    fetchData(id, year)
  }

  function handleYearChange(delta: number) {
    const newYear = year + delta
    setYear(newYear)
    setEditingGrant(false)
    setShowUsageForm(false)
    fetchData(selectedStaffId, newYear)
  }

  async function handleSaveGrant() {
    const days = parseFloat(grantDays)
    if (isNaN(days) || days < 0) return
    const hpd = parseInt(grantHoursPerDay)
    setSavingGrant(true)
    try {
      const res = await fetch('/api/staff/paid-leave/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaffId,
          year,
          total_days: days,
          note: grantNote || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        alert(j.error ?? '保存失敗')
        return
      }
      const j = await res.json()
      setGrants((prev) => {
        const filtered = prev.filter((g) => !(g.staff_id === selectedStaffId && g.year === year))
        return [...filtered, j.data]
      })

      // 1日分の時間数（所定労働時間）が変わっていれば併せて保存する
      if (Number.isInteger(hpd) && hpd >= 1 && hpd !== hoursPerDay) {
        const hRes = await fetch('/api/staff/paid-leave/hours-per-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_id: selectedStaffId, hours_per_day: hpd }),
        })
        if (hRes.ok) {
          setStaff((prev) => prev.map((s) => (
            s.id === selectedStaffId ? { ...s, paid_leave_hours_per_day: hpd } : s
          )))
        } else {
          const j2 = await hRes.json().catch(() => ({})) as { error?: string }
          alert(j2.error ?? '1日分の時間数の保存に失敗しました')
        }
      }

      setEditingGrant(false)
      setGrantDays('')
      setGrantNote('')
      setGrantHoursPerDay('')
    } finally {
      setSavingGrant(false)
    }
  }

  async function handleSaveUsage() {
    if (!usageDate) return
    setSavingUsage(true)
    try {
      const isHour = usageUnit === 'hour'
      const res = await fetch('/api/staff/paid-leave/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaffId,
          date: usageDate,
          unit: isHour ? 'hour' : 'day',
          days_used: isHour ? 0 : parseFloat(usageUnit),
          hours: isHour ? parseInt(usageHours) : undefined,
          note: usageNote || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        alert(j.error ?? '保存失敗')
        return
      }
      const j = await res.json()
      setUsages((prev) => [...prev.filter((u) => u.id !== j.data.id), j.data])
      setShowUsageForm(false)
      setUsageDate('')
      setUsageUnit('1.0')
      setUsageHours('1')
      setUsageNote('')
    } finally {
      setSavingUsage(false)
    }
  }

  async function handleDeleteUsage(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/staff/paid-leave/usage?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json()
        alert(j.error ?? '削除失敗')
        return
      }
      setUsages((prev) => prev.filter((u) => u.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  function startEditGrant() {
    setGrantDays(currentGrant ? String(currentGrant.total_days) : '')
    setGrantNote(currentGrant?.note ?? '')
    setGrantHoursPerDay(String(hoursPerDay))
    setEditingGrant(true)
  }

  return (
    <div className="flex gap-5">
      {/* Staff list */}
      <div className="w-48 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
            スタッフ
          </div>
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => handleStaffChange(s.id)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-gray-100 last:border-0 ${
                s.id === selectedStaffId
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Year selector */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleYearChange(-1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-lg font-semibold text-gray-900 w-20 text-center">{year}年度</span>
          <button
            onClick={() => handleYearChange(1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-400">{year}年4月1日〜{year + 1}年3月31日</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">付与日数</div>
            <div className="text-2xl font-bold text-gray-900">
              {currentGrant ? `${currentGrant.total_days}日` : '—'}
            </div>
            {currentGrant?.note && (
              <div className="text-xs text-gray-400 mt-1 truncate">{currentGrant.note}</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">使用</div>
            <div className="text-2xl font-bold text-orange-600">{formatUsedLabel(usedDays, usedHours)}</div>
            <div className="text-xs text-gray-400 mt-1">1日＝{hoursPerDay}時間で換算</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">残日数</div>
            <div className={`text-2xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {currentGrant ? formatDayHours(remaining, hoursPerDay) : '—'}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">時間単位の残枠</div>
            <div className={`text-2xl font-bold ${hourlyRemaining <= 0 ? 'text-gray-400' : 'text-indigo-600'}`}>
              {hourlyRemaining}<span className="text-sm font-normal text-gray-400 ml-0.5">時間</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              年{HOURLY_LEAVE_LIMIT_DAYS}日分＝{hourlyLimit}時間が上限
            </div>
          </div>
        </div>

        {/* 年5日の取得義務 */}
        {mandatoryTarget && (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${
            mandatoryShortage > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
          }`}>
            <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
              mandatoryShortage > 0 ? 'text-amber-500' : 'text-green-500'
            }`} />
            <div className="text-sm">
              <p className={`font-semibold ${mandatoryShortage > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                年{MANDATORY_LEAVE_DAYS}日の取得義務: {usedDays}日 / {MANDATORY_LEAVE_DAYS}日
                {mandatoryShortage > 0 ? `（あと${mandatoryShortage}日）` : '（達成）'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                年{MANDATORY_LEAVE_THRESHOLD_DAYS}日以上付与された職員が対象です。
                時間単位で取得した{usedHours}時間はこの日数に充当できません（労基法39条7項）。
              </p>
            </div>
          </div>
        )}

        {/* Grant section */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">付与日数設定</h3>
            {!editingGrant && (
              <button
                onClick={startEditGrant}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                {currentGrant ? '編集' : '設定'}
              </button>
            )}
          </div>

          {editingGrant ? (
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">付与日数</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="10"
                />
              </div>
              <div>
                <label
                  className="block text-xs text-gray-500 mb-1"
                  title="時間単位年休の1日分の時間数（所定労働時間・1時間未満の端数は切り上げ）"
                >
                  1日分の時間数
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="1"
                  value={grantHoursPerDay}
                  onChange={(e) => setGrantHoursPerDay(e.target.value)}
                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="8"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">備考</label>
                <input
                  type="text"
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="法定付与など"
                />
              </div>
              <button
                onClick={handleSaveGrant}
                disabled={savingGrant}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingGrant ? '保存中…' : '保存'}
              </button>
              <button
                onClick={() => setEditingGrant(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {currentGrant
                ? `${year}年度の有給付与日数: ${currentGrant.total_days}日（1日分の時間数: ${hoursPerDay}時間）`
                : `${year}年度の付与日数が未設定です。`}
            </p>
          )}
        </div>

        {/* Usage section */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              有給使用履歴
            </h3>
            <button
              onClick={() => {
                setShowUsageForm(true)
                setUsageDate('')
                setUsageUnit('1.0')
                setUsageHours('1')
                setUsageNote('')
              }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          </div>

          {showUsageForm && (
            <div className="flex items-end gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-xs text-gray-500 mb-1">日付</label>
                <input
                  type="date"
                  value={usageDate}
                  onChange={(e) => setUsageDate(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">単位</label>
                <select
                  value={usageUnit}
                  onChange={(e) => setUsageUnit(e.target.value as '1.0' | '0.5' | 'hour')}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="1.0">1日</option>
                  <option value="0.5">半日</option>
                  <option value="hour">時間単位</option>
                </select>
              </div>
              {usageUnit === 'hour' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">時間数</label>
                  <select
                    value={usageHours}
                    onChange={(e) => setUsageHours(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    {Array.from({ length: hoursPerDay }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={String(h)}>{h}時間</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">備考</label>
                <input
                  type="text"
                  value={usageNote}
                  onChange={(e) => setUsageNote(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  placeholder="任意"
                />
              </div>
              <button
                onClick={handleSaveUsage}
                disabled={savingUsage}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingUsage ? '保存中…' : '保存'}
              </button>
              <button
                onClick={() => setShowUsageForm(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          )}

          {currentUsages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{year}年度の有給使用記録がありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">日付</th>
                  <th className="text-center pb-2 font-medium">取得</th>
                  <th className="text-left pb-2 font-medium">備考</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {currentUsages.map((u) => {
                  const [, m, d] = u.date.split('-').map(Number)
                  const isHour = u.unit === 'hour'
                  return (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-900">{m}月{d}日</td>
                      <td className="py-2 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          isHour ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {usageLabel(u)}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{u.note ?? '—'}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDeleteUsage(u.id)}
                          disabled={deletingId === u.id}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="text-xs text-gray-500 border-t border-gray-200">
                  <td className="pt-2 font-medium">合計</td>
                  <td className="pt-2 text-center font-semibold text-orange-600">
                    {formatUsedLabel(usedDays, usedHours)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
