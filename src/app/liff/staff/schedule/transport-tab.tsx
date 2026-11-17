'use client'

import { useEffect, useState } from 'react'
import { Loader2, Car, MapPin, User, Home, AlertTriangle } from 'lucide-react'
import type { LiffTransportTrip, LiffNoTransportChild } from '@/lib/liff-transport'
import { UNIT_COURSES, type UnitCourse } from '@/lib/unit-course'

/**
 * スタッフ LINE の「全体」タブ。その日の送迎管理を、ユニットを分けずに便ごとに並べて見せる（閲覧のみ）。
 * 自分がドライバーの便は色を変えて目立たせる。
 * 上のボタンで「デイ・英語・パソコン」に絞りこめる。いちばん下に、その日に来るのに
 * 送迎がない子（保護者の送り迎え）を「送迎なし」として並べる。
 */

type CourseFilter = 'all' | UnitCourse

const FILTERS: { key: CourseFilter; label: string }[] = [
  { key: 'all', label: '全体' },
  ...UNIT_COURSES,
]

const FILTER_STORAGE_KEY = 'liff-staff-transport-course'

function loadFilter(): CourseFilter {
  try {
    const v = window.localStorage.getItem(FILTER_STORAGE_KEY)
    if (v === 'all' || UNIT_COURSES.some((c) => c.key === v)) return v as CourseFilter
  } catch {
    // 保存できない環境では毎回「全体」から
  }
  return 'all'
}

/** 送迎なしの子の札。便に未登録の向きは見落とさないよう黄色で出す */
function noTransportLabel(c: LiffNoTransportChild): { text: string; warn: boolean }[] {
  const tags: { text: string; warn: boolean }[] = []
  if (c.pickup === 'none' && c.dropoff === 'none') {
    tags.push({ text: '送迎なし', warn: false })
  } else {
    if (c.pickup === 'none') tags.push({ text: '行きは送迎なし', warn: false })
    if (c.dropoff === 'none') tags.push({ text: '帰りは送迎なし', warn: false })
  }
  if (c.pickup === 'unassigned') tags.push({ text: 'お迎えの予定あり・便に未登録', warn: true })
  if (c.dropoff === 'unassigned') tags.push({ text: 'お送りの予定あり・便に未登録', warn: true })
  return tags
}

type Result =
  | { key: string; kind: 'ok'; trips: LiffTransportTrip[]; noTransport: LiffNoTransportChild[] }
  | { key: string; kind: 'error'; message: string }

const DIRECTION = {
  pickup:  { label: 'お迎え', color: 'bg-blue-100 text-blue-700' },
  dropoff: { label: 'お送り', color: 'bg-orange-100 text-orange-700' },
} as const

export function TransportTab({
  accessToken,
  date,
  reloadKey,
}: {
  accessToken: string
  date: string
  reloadKey: number
}) {
  const [result, setResult] = useState<Result | null>(null)
  // 前に選んだ区分を覚えておく（この端末だけ。全体タブを開いたときに読む）
  const [filter, setFilter] = useState<CourseFilter>(loadFilter)
  const chooseFilter = (next: CourseFilter) => {
    setFilter(next)
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, next)
    } catch {
      // 保存できなくても絞りこみはそのまま使える
    }
  }
  const requestKey = `${date}#${reloadKey}`
  const loading = result?.key !== requestKey

  useEffect(() => {
    let cancelled = false
    fetch('/api/liff/staff/transport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, date }),
    })
      .then(async (r) => {
        const json = await r.json() as {
          trips?: LiffTransportTrip[]
          noTransport?: LiffNoTransportChild[]
          error?: string
        }
        if (cancelled) return
        setResult(
          r.ok
            ? { key: requestKey, kind: 'ok', trips: json.trips ?? [], noTransport: json.noTransport ?? [] }
            : { key: requestKey, kind: 'error', message: json.error ?? `HTTP ${r.status}` },
        )
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, kind: 'error', message: String(e) })
      })
    return () => { cancelled = true }
  }, [accessToken, date, requestKey])

  if (!result) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (result.kind === 'error') {
    return (
      <div className="px-3 pt-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-red-500 text-center">
          送迎を取得できませんでした
        </div>
      </div>
    )
  }

  // 絞りこみ：便の中から区分の合う子だけを残し、子が残らない便は出さない。
  // 便の時刻は残った子の中で一番早い時刻にする（ほかの区分の子の時刻で並ばないように）
  const trips = result.trips
    .map((trip) => {
      if (filter === 'all') return trip
      const children = trip.children.filter((c) => c.course === filter)
      const times = children.filter((c) => !c.isAbsent && c.time).map((c) => c.time as string).sort()
      return { ...trip, children, time: times[0] ?? (children.length > 0 ? trip.time : null) }
    })
    .filter((trip) => trip.children.length > 0)
  const noTransport = result.noTransport.filter((c) => filter === 'all' || c.courses.includes(filter))
  const mineCount = trips.filter((t) => t.isMine).length
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label ?? '全体'

  return (
    <div className={`px-3 pt-4 space-y-2 transition-opacity ${loading ? 'opacity-50' : ''}`}>
      <div className="flex gap-1.5" role="tablist" aria-label="送迎の絞りこみ">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => chooseFilter(f.key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-colors ${
              filter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 px-1 pt-1">
        <Car className="h-3.5 w-3.5" />
        {filter !== 'all' && <span className="text-indigo-600">{filterLabel}の</span>}
        送迎 {trips.length}便
        {mineCount > 0 && <span className="text-indigo-600">（うち自分 {mineCount}便）</span>}
      </p>

      {trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
          {filter === 'all' ? 'この日の送迎はありません' : `この日の${filterLabel}の送迎はありません`}
        </div>
      ) : (
        trips.map((trip) => {
          const dir = DIRECTION[trip.direction]
          const allAbsent = trip.children.every((c) => c.isAbsent)
          return (
            <div
              key={trip.key}
              className={`rounded-2xl shadow-sm px-4 py-3 ${
                trip.isMine ? 'bg-indigo-50 border-2 border-indigo-400' : 'bg-white border-2 border-transparent'
              } ${allAbsent ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${dir.color}`}>{dir.label}</span>
                <span className={`text-base font-bold ${trip.isConfirmed ? 'text-gray-900' : 'text-indigo-500'}`}>
                  {trip.time ?? '時間未定'}
                </span>
                {!trip.isConfirmed && trip.time && (
                  <span className="text-[10px] text-indigo-400">予定</span>
                )}
                {trip.isMine && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">自分</span>
                )}
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-gray-400" />
                  {trip.driverNames.length > 0 ? trip.driverNames.join('・') : <span className="text-gray-400">ドライバー未定</span>}
                </span>
                {trip.vehicleNames.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Car className="h-3 w-3 text-gray-400" />
                    {trip.vehicleNames.join('・')}
                  </span>
                )}
              </div>

              <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
                {trip.children.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className={`text-sm font-medium ${c.isAbsent ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {c.name}
                    </span>
                    {c.isAbsent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">欠席</span>
                    )}
                    {c.isDaytime && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">日中一時</span>
                    )}
                    {c.location && (
                      <span className="ml-auto flex items-center gap-0.5 text-xs text-gray-500 truncate max-w-[45%]">
                        <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate">{c.location}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}

      {noTransport.length > 0 && (
        <div className="rounded-2xl shadow-sm px-4 py-3 bg-white border-2 border-transparent">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold bg-gray-100 text-gray-600">
              <Home className="h-3 w-3" />
              送迎なし
            </span>
            <span className="text-xs text-gray-500">{noTransport.length}人</span>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">その日に来るけれど、送迎の便に入っていない子です</p>
          <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
            {noTransport.map((c, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5">
                <span className="text-sm font-medium text-gray-900 shrink-0">{c.name}</span>
                <span className="ml-auto flex flex-wrap justify-end gap-1">
                  {noTransportLabel(c).map((t) => (
                    <span
                      key={t.text}
                      className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                        t.warn ? 'bg-amber-100 text-amber-800 font-semibold' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t.warn && <AlertTriangle className="h-3 w-3" />}
                      {t.text}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {noTransport.some((c) => c.pickup === 'unassigned' || c.dropoff === 'unassigned') && (
            <p className="mt-1.5 text-[10px] text-amber-700">
              「便に未登録」の子は、予定では送迎があります。管理画面の送迎管理で確かめてください
            </p>
          )}
        </div>
      )}

      <p className="text-center text-[10px] text-gray-400 pt-1">
        送迎管理の内容を表示しています（閲覧のみ・変更は管理画面から）
      </p>
    </div>
  )
}
