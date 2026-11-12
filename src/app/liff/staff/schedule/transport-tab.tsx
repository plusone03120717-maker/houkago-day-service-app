'use client'

import { useEffect, useState } from 'react'
import { Loader2, Car, MapPin, User } from 'lucide-react'
import type { LiffTransportTrip } from '@/app/api/liff/staff/transport/route'

/**
 * スタッフ LINE の「全体」タブ。その日の送迎管理を、ユニットを分けずに便ごとに並べて見せる（閲覧のみ）。
 * 自分がドライバーの便は色を変えて目立たせる。
 */

type Result =
  | { key: string; kind: 'ok'; trips: LiffTransportTrip[] }
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
        const json = await r.json() as { trips?: LiffTransportTrip[]; error?: string }
        if (cancelled) return
        setResult(
          r.ok
            ? { key: requestKey, kind: 'ok', trips: json.trips ?? [] }
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

  const trips = result.trips
  const mineCount = trips.filter((t) => t.isMine).length

  return (
    <div className={`px-3 pt-4 space-y-2 transition-opacity ${loading ? 'opacity-50' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 px-1">
        <Car className="h-3.5 w-3.5" />
        送迎 {trips.length}便
        {mineCount > 0 && <span className="text-indigo-600">（うち自分 {mineCount}便）</span>}
      </p>

      {trips.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-400">
          この日の送迎はありません
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

      <p className="text-center text-[10px] text-gray-400 pt-1">
        送迎管理の内容を表示しています（閲覧のみ・変更は管理画面から）
      </p>
    </div>
  )
}
