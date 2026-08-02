'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, ChevronRight, CheckCircle, Flag,
  UserCheck, UserX,
} from 'lucide-react'
import { DateNav } from '@/components/ui/date-nav'
import { formatDate } from '@/lib/utils'
import {
  TransportDaytimePanel,
  TransportDaytimeToggle,
  initFields,
  isBlankFields,
  applyScheduleDefaults,
  buildTransportUpdate,
  type TransportRow,
  type TransportFields,
  type ScheduleDefaults,
  type StaffMember,
  type Vehicle,
} from '@/components/transport/transport-daytime-panel'

type AttendedChild = TransportRow & {
  id: string
  child_id: string
  unit_id: string
  status: string
  children: { id: string; name: string; name_kana: string | null } | null
  units: { id: string; name: string } | null
}

type PrevAttendanceRow = TransportRow & {
  child_id: string
  date: string
}

type DailyRecord = {
  id: string
  attendance_id: string
  has_notable_flag: boolean
}

interface Props {
  targetDate: string
  prevDate: string
  nextDate: string
  byUnit: Record<string, { unitName: string; items: AttendedChild[] }>
  staffMembers: StaffMember[]
  vehicles: Vehicle[]
  recordByAttendanceId: Record<string, DailyRecord>
  writtenCount: number
  totalCount: number
  defaultServiceEndTime: string
  prevByChildId: Record<string, PrevAttendanceRow>
  scheduleDefaultsByAttendanceId: Record<string, ScheduleDefaults>
}

export function RecordsListBoard({
  targetDate,
  prevDate,
  nextDate,
  byUnit,
  staffMembers,
  vehicles,
  recordByAttendanceId,
  writtenCount,
  totalCount,
  defaultServiceEndTime,
  prevByChildId,
  scheduleDefaultsByAttendanceId,
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fieldStates, setFieldStates] = useState<Record<string, TransportFields>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  // 出席状態のローカルオーバーライド（楽観的更新）
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({})
  const [statusSaving, setStatusSaving] = useState<Set<string>>(new Set())

  const allItems = Object.values(byUnit).flatMap((u) => u.items)

  // DBの値が空の場合は利用スケジュールの初期値を自動セット
  const buildInitialFields = (a: AttendedChild): TransportFields => {
    const base = initFields(a, defaultServiceEndTime)
    const sched = scheduleDefaultsByAttendanceId[a.id]
    if (sched && isBlankFields(base)) {
      return applyScheduleDefaults(base, sched, defaultServiceEndTime)
    }
    return base
  }

  // このセッションで保存済みのID（保存後はプリセット表示を解除するため）
  const [savedOnce, setSavedOnce] = useState<Set<string>>(new Set())

  // スケジュール初期値が表示中（未保存）かどうか
  const isSchedulePreset = (a: AttendedChild): boolean => {
    const sched = scheduleDefaultsByAttendanceId[a.id]
    return !!sched && !savedOnce.has(a.id) && isBlankFields(initFields(a, defaultServiceEndTime))
  }

  const getFields = (a: AttendedChild): TransportFields =>
    fieldStates[a.id] ?? buildInitialFields(a)

  // 前回（直近の出席日）の入力内容をまるごと複写
  const handleCopyPrevious = (a: AttendedChild) => {
    const prev = prevByChildId[a.child_id]
    if (!prev) return
    setFieldStates((s) => ({ ...s, [a.id]: initFields(prev, defaultServiceEndTime) }))
  }

  const getStatus = (a: AttendedChild): string =>
    localStatus[a.id] ?? a.status

  const setField = (attendanceId: string, patch: Partial<TransportFields>, a: AttendedChild) => {
    setFieldStates((prev) => ({
      ...prev,
      [attendanceId]: { ...(prev[attendanceId] ?? buildInitialFields(a)), ...patch },
    }))
  }

  const handleToggleStatus = async (a: AttendedChild) => {
    const current = getStatus(a)
    const next = current === 'attended' ? 'absent' : 'attended'
    setLocalStatus((prev) => ({ ...prev, [a.id]: next }))
    setStatusSaving((prev) => new Set(prev).add(a.id))
    await supabase.from('daily_attendance').update({ status: next }).eq('id', a.id)
    setStatusSaving((prev) => { const s = new Set(prev); s.delete(a.id); return s })
    startTransition(() => {})
  }

  const handleSave = async (a: AttendedChild) => {
    setSaving(a.id)
    await supabase
      .from('daily_attendance')
      .update(buildTransportUpdate(getFields(a)))
      .eq('id', a.id)

    setSaving(null)
    setSavedOnce((prev) => new Set(prev).add(a.id))
    setSavedIds((prev) => new Set(prev).add(a.id))
    setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(a.id); return s }), 2000)
    startTransition(() => {})
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">日々の記録</h1>
        <p className="text-sm text-gray-500 mt-0.5">児童ごとの日報・活動記録・連絡帳</p>
      </div>

      <div className="flex items-center gap-3">
        <DateNav
          targetDate={targetDate}
          prevDate={prevDate}
          nextDate={nextDate}
          basePath="/records"
        />
        <span className="text-sm text-gray-500">{formatDate(targetDate, 'yyyy年MM月dd日')}</span>
        <span className="ml-auto text-sm text-gray-500">
          記録済 {writtenCount} / {totalCount} 名
        </span>
      </div>

      {allItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          この日の出席記録がありません
        </div>
      ) : (
        Object.entries(byUnit).map(([unitId, { unitName, items }]) => (
          <div key={unitId}>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{unitName}</h2>
            <div className="space-y-3">
              {items.map((a) => {
                const record = recordByAttendanceId[a.id]
                const hasRecord = !!record
                const currentStatus = getStatus(a)
                const isAbsent = currentStatus === 'absent'
                const isExpanded = expanded === a.id
                const f = getFields(a)
                const isStatusSaving = statusSaving.has(a.id)

                return (
                  <div key={a.id}>
                    <Card className={`${isAbsent ? 'opacity-70' : ''} ${isExpanded ? 'rounded-b-none border-b-0' : ''} overflow-hidden`}>
                      {/* 名前・記録状態 → 詳細ページへのリンク */}
                      <Link href={`/records/${a.child_id}?date=${targetDate}&unit=${unitId}`}>
                        <CardContent className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              hasRecord ? 'bg-green-100' : isAbsent ? 'bg-gray-100' : 'bg-orange-100'
                            }`}>
                              <BookOpen className={`h-4 w-4 ${
                                hasRecord ? 'text-green-600' : isAbsent ? 'text-gray-400' : 'text-orange-500'
                              }`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{a.children?.name ?? '—'}</p>
                              {a.children?.name_kana && (
                                <p className="text-xs text-gray-400">{a.children.name_kana}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {record?.has_notable_flag && <Flag className="h-4 w-4 text-yellow-500" />}
                            {hasRecord ? (
                              <Badge variant="success" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />記録済
                              </Badge>
                            ) : !isAbsent ? (
                              <Badge variant="warning" className="text-xs">未記録</Badge>
                            ) : null}
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </CardContent>
                      </Link>

                      {/* 出席・欠席トグル */}
                      <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 mr-1">出席状態：</span>
                        <button
                          type="button"
                          disabled={isStatusSaving}
                          onClick={() => { if (isAbsent) handleToggleStatus(a) }}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            !isAbsent
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-white text-gray-400 border-gray-200 hover:bg-green-50 hover:text-green-600'
                          }`}
                        >
                          <UserCheck className="h-3.5 w-3.5" />出席
                        </button>
                        <button
                          type="button"
                          disabled={isStatusSaving}
                          onClick={() => !isAbsent && handleToggleStatus(a)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            isAbsent
                              ? 'bg-gray-200 text-gray-600 border-gray-300'
                              : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                          }`}
                        >
                          <UserX className="h-3.5 w-3.5" />欠席
                        </button>
                        {isStatusSaving && <span className="text-xs text-gray-400 ml-1">更新中...</span>}
                      </div>

                      {/* 送迎・日中一時入力トグル */}
                      {!isAbsent && (
                        <TransportDaytimeToggle
                          expanded={isExpanded}
                          onToggle={() => setExpanded(isExpanded ? null : a.id)}
                          fields={f}
                          isSchedulePreset={isSchedulePreset(a)}
                        />
                      )}
                    </Card>

                    {/* 展開された入力エリア */}
                    {isExpanded && !isAbsent && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-4">
                          <TransportDaytimePanel
                            fields={f}
                            onChange={(patch) => setField(a.id, patch, a)}
                            staffMembers={staffMembers}
                            vehicles={vehicles}
                            defaultServiceEndTime={defaultServiceEndTime}
                            isSchedulePreset={isSchedulePreset(a)}
                            previousDate={prevByChildId[a.child_id]?.date ?? null}
                            onCopyPrevious={() => handleCopyPrevious(a)}
                            onSave={() => handleSave(a)}
                            saving={saving === a.id}
                            saved={savedIds.has(a.id)}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
