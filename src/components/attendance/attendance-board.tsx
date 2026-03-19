'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Thermometer,
  ClipboardEdit,
  Car,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

export type Unit = {
  id: string
  name: string
  service_type: string
  capacity: number
  facilities: { id: string; name: string } | null
}

export type Reservation = {
  id: string
  child_id: string
  date: string
  status: string
  children: {
    id: string
    name: string
    name_kana: string | null
    photo_url: string | null
    allergy_info: string | null
    medical_info: string | null
  } | null
}

export type Attendance = {
  id: string
  child_id: string
  unit_id: string
  date: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  pickup_type: string
  body_temperature: number | null
  health_condition: string | null
}

interface Props {
  date: string
  units: Unit[]
  selectedUnitId: string
  reservations: Reservation[]
  attendances: Attendance[]
  staffId: string
}

export function AttendanceBoard({ date, units, selectedUnitId, reservations, attendances, staffId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)
  const [tempInput, setTempInput] = useState<Record<string, string>>({})

  const attendanceMap = Object.fromEntries(attendances.map((a) => [a.child_id, a]))

  // 日付を1日前後に移動
  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const params = new URLSearchParams({ date: formatDate(d, 'yyyy-MM-dd'), unit: selectedUnitId })
    router.push(`/attendance?${params.toString()}`)
  }

  const changeUnit = (unitId: string) => {
    router.push(`/attendance?date=${date}&unit=${unitId}`)
  }

  // 出席記録を作成/更新
  const upsertAttendance = async (childId: string, updates: Partial<Attendance>) => {
    setSaving(childId)
    const existing = attendanceMap[childId]

    if (existing) {
      await supabase
        .from('daily_attendance')
        .update(updates)
        .eq('id', existing.id)
    } else {
      await supabase.from('daily_attendance').insert({
        child_id: childId,
        unit_id: selectedUnitId,
        date,
        status: 'attended',
        pickup_type: 'none',
        created_by: staffId,
        ...updates,
      })
    }

    setSaving(null)
    startTransition(() => router.refresh())
  }

  // 一括出席登録
  const markAllPresent = async () => {
    setSaving('all')
    const unrecorded = reservations.filter(
      (r) => r.status !== 'cancel_waiting' && !attendanceMap[r.child_id]
    )
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    await Promise.all(
      unrecorded.map((r) =>
        supabase.from('daily_attendance').insert({
          child_id: r.child_id,
          unit_id: selectedUnitId,
          date,
          status: 'attended',
          check_in_time: timeStr,
          pickup_type: 'none',
          created_by: staffId,
        })
      )
    )
    setSaving(null)
    startTransition(() => router.refresh())
  }

  const attending = reservations.filter((r) => {
    const att = attendanceMap[r.child_id]
    return att?.status === 'attended'
  })
  const absent = reservations.filter((r) => {
    const att = attendanceMap[r.child_id]
    return att?.status === 'absent' || r.status === 'cancel_waiting'
  })
  const unrecorded = reservations.filter((r) => {
    return !attendanceMap[r.child_id] && r.status !== 'cancel_waiting'
  })

  const selectedUnit = units.find((u) => u.id === selectedUnitId)

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">出席管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">出席・欠席・入退室時間の記録</p>
        </div>
        {unrecorded.length > 0 && (
          <Button onClick={markAllPresent} disabled={saving === 'all'}>
            <CheckCircle className="h-4 w-4" />
            未記録を一括出席登録
          </Button>
        )}
      </div>

      {/* 日付・ユニット選択バー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const params = new URLSearchParams({ date: e.target.value, unit: selectedUnitId })
              router.push(`/attendance?${params.toString()}`)
            }}
            className="text-sm font-medium text-gray-900 border-none outline-none cursor-pointer"
          />
          <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => changeUnit(u.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                u.id === selectedUnitId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">{attending.length}</div>
            <div className="text-xs text-gray-500 mt-1">出席</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{absent.length}</div>
            <div className="text-xs text-gray-500 mt-1">欠席/キャンセル</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{unrecorded.length}</div>
            <div className="text-xs text-gray-500 mt-1">未記録</div>
          </CardContent>
        </Card>
        <Card className="hidden sm:block">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">
              {attending.length}/{selectedUnit?.capacity ?? '-'}
            </div>
            <div className="text-xs text-gray-500 mt-1">定員充足率</div>
          </CardContent>
        </Card>
      </div>

      {/* 未記録アラート */}
      {unrecorded.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{unrecorded.length}名の記録が未入力です</span>
        </div>
      )}

      {/* 児童一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">利用予定児童一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {reservations.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">この日の利用予定はありません</p>
            ) : (
              reservations.map((res) => {
                const child = res.children
                if (!child) return null
                const att = attendanceMap[child.id]
                const isPresent = att?.status === 'attended'
                const isAbsent = att?.status === 'absent' || res.status === 'cancel_waiting'
                const isUnrecorded = !att && res.status !== 'cancel_waiting'

                return (
                  <div
                    key={res.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 ${
                      isUnrecorded ? 'bg-yellow-50' : ''
                    }`}
                  >
                    {/* 児童情報 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                          isPresent
                            ? 'bg-green-100 text-green-700'
                            : isAbsent
                            ? 'bg-red-100 text-red-500'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {child.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{child.name}</span>
                          {child.allergy_info && (
                            <Badge variant="destructive" className="text-xs">アレルギー</Badge>
                          )}
                          {isUnrecorded && (
                            <Badge variant="warning" className="text-xs">未記録</Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{child.name_kana}</div>
                      </div>
                    </div>

                    {/* 体温入力（出席時のみ） */}
                    {isPresent && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Thermometer className="h-4 w-4 text-orange-400" />
                        <Input
                          type="number"
                          step="0.1"
                          min="35"
                          max="42"
                          placeholder="体温"
                          defaultValue={att?.body_temperature?.toString() ?? ''}
                          className="w-20 h-7 text-xs"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val)) upsertAttendance(child.id, { body_temperature: val })
                          }}
                        />
                      </div>
                    )}

                    {/* 入退室時間（出席時のみ） */}
                    {isPresent && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <input
                          type="time"
                          defaultValue={att?.check_in_time ?? ''}
                          className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                          onBlur={(e) => upsertAttendance(child.id, { check_in_time: e.target.value || null })}
                        />
                        <span className="text-gray-400">〜</span>
                        <input
                          type="time"
                          defaultValue={att?.check_out_time ?? ''}
                          className="text-xs border border-gray-200 rounded px-1.5 py-0.5"
                          onBlur={(e) => upsertAttendance(child.id, { check_out_time: e.target.value || null })}
                        />
                      </div>
                    )}

                    {/* 出席/欠席ボタン */}
                    <div className="flex items-center gap-2">
                      {res.status !== 'cancel_waiting' && (
                        <>
                          <button
                            onClick={() => upsertAttendance(child.id, { status: 'attended' })}
                            disabled={saving === child.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isPresent
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700'
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            出席
                          </button>
                          <button
                            onClick={() => upsertAttendance(child.id, { status: 'absent' })}
                            disabled={saving === child.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isAbsent && res.status !== 'cancel_waiting'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700'
                            }`}
                          >
                            <XCircle className="h-4 w-4" />
                            欠席
                          </button>
                        </>
                      )}

                      {res.status === 'cancel_waiting' && (
                        <Badge variant="secondary">キャンセル待ち</Badge>
                      )}

                      {/* 記録ページへのリンク */}
                      {isPresent && (
                        <Link
                          href={`/records/${child.id}?date=${date}&unit=${selectedUnitId}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <ClipboardEdit className="h-4 w-4" />
                          記録
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
