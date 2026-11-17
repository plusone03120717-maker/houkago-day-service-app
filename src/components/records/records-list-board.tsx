'use client'

import Link from 'next/link'
import { needsDailyRecord } from '@/lib/unit-course'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, ChevronRight, CheckCircle, Flag, Car, ExternalLink } from 'lucide-react'
import { DateNav } from '@/components/ui/date-nav'
import { formatDate } from '@/lib/utils'
import {
  initFields,
  type TransportRow,
  type TransportFields,
  type ScheduleDefaults,
  type StaffMember,
  type Vehicle,
} from '@/components/transport/transport-daytime-panel'

/**
 * 日々の記録の「出欠・送迎の一覧」（?view=list）。
 *
 * 2026-11-18 依頼主「おすすめのものを実装して」（案 D）：この一覧から出欠の切りかえと送迎の入力を外し、見るだけにした。
 * 入力は出席管理（かんたん入力）だけにする。
 *  - ここの出欠の切りかえは、権限を見ず・欠席の理由も聞かず・保存の失敗も知らせず、
 *    欠席にしても送迎の担当（ドライバー・車種）や時刻を消していなかった
 *    （欠席なのにドライバーが残る枠が月2件ほどあった元）
 *  - 送迎の入力も、出席管理と2か所に分かれていた
 */

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
  /** 入力をやめたので使わない（呼び出し側との互換のために残す） */
  prevByChildId?: Record<string, PrevAttendanceRow>
  /** 入力をやめたので使わない（呼び出し側との互換のために残す） */
  scheduleDefaultsByAttendanceId?: Record<string, ScheduleDefaults>
  /** 入力をやめたので使わない（呼び出し側との互換のために残す） */
  canAssignDrivers?: boolean
}

/** 送迎の1行の要約（記録に入っている値だけ。入っていなければ出さない） */
function transportSummary(f: TransportFields, nameOf: (id: string) => string | null): string[] {
  const leg = (label: string, time: string, driverId: string) => {
    if (!time && !driverId) return null
    const driver = driverId ? nameOf(driverId) : null
    return `${label} ${time || '時刻なし'}${driver ? `（${driver}）` : ''}`
  }
  return [
    leg('迎え', f.pickupDepartureTime, f.pickupDriverId),
    leg('送り', f.dropoffDepartureTime, f.dropoffDriverId),
    f.daytimeSupport ? '日中一時あり' : null,
    leg('迎え（日中一時）', f.daytimePickupDepartureTime, f.daytimePickupDriverId),
    leg('送り（日中一時）', f.daytimeDropoffDepartureTime, f.daytimeDropoffDriverId),
  ].filter((s): s is string => !!s)
}

export function RecordsListBoard({
  targetDate,
  prevDate,
  nextDate,
  byUnit,
  staffMembers,
  recordByAttendanceId,
  writtenCount,
  totalCount,
  defaultServiceEndTime,
}: Props) {
  const allItems = Object.values(byUnit).flatMap((u) => u.items)
  const staffName = new Map(staffMembers.map((s) => [s.id, s.name]))
  const nameOf = (id: string) => staffName.get(id) ?? null
  const attendanceHref = `/attendance?date=${targetDate}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">日々の記録（出欠・送迎の一覧）</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          その日の出欠・送迎と、記録を書いたかを見る画面です。
          <Link href={`/records?date=${targetDate}`} className="ml-2 text-indigo-600 hover:underline">
            ← 記録を書く画面にもどる
          </Link>
        </p>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
        data-testid="attendance-moved-note"
      >
        出欠・送迎の入力は、出席管理（かんたん入力）でします。
        <Link href={attendanceHref} className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
          出席管理をひらく
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <DateNav
          targetDate={targetDate}
          prevDate={prevDate}
          nextDate={nextDate}
          basePath="/records"
          extraParams="&view=list"
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
        Object.entries(byUnit).map(([groupKey, { unitName, items }]) => (
          <div key={groupKey}>
            {unitName && <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{unitName}</h2>}
            <div className="space-y-3">
              {items.map((a) => {
                const record = recordByAttendanceId[a.id]
                const hasRecord = !!record
                const isAbsent = a.status === 'absent'
                const summary = isAbsent ? [] : transportSummary(initFields(a, defaultServiceEndTime), nameOf)

                return (
                  <Card key={a.id} className={`${isAbsent ? 'opacity-70' : ''} overflow-hidden`}>
                    {/* 名前・記録状態 → 記録を書く画面へ */}
                    <Link href={`/records/${a.child_id}?date=${targetDate}&unit=${a.unit_id}`}>
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
                            {(a.children?.name_kana || a.units?.name) && (
                              <p className="text-xs text-gray-400">
                                {a.children?.name_kana}
                                {a.units?.name && <span className="ml-1.5">（{a.units.name}）</span>}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {record?.has_notable_flag && <Flag className="h-4 w-4 text-yellow-500" />}
                          {!needsDailyRecord(a.units?.name) && !hasRecord ? (
                            <span className="text-xs text-gray-400">記録は不要</span>
                          ) : hasRecord ? (
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

                    {/* 出欠・送迎（見るだけ） */}
                    <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap items-center gap-2 text-xs" data-testid="list-status-row">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 font-medium ${
                          isAbsent ? 'bg-gray-100 text-gray-600 border-gray-300' : 'bg-green-50 text-green-700 border-green-200'
                        }`}
                        data-testid="list-status"
                      >
                        {isAbsent ? '欠席' : '出席'}
                      </span>
                      {!isAbsent && (
                        <span className="flex items-center gap-1 text-gray-600">
                          <Car className="h-3.5 w-3.5 text-teal-500" />
                          {summary.length > 0 ? summary.join('・') : '送迎なし（または未入力）'}
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
