'use client'

import type { ReactNode } from 'react'
import { Car, Route, AlertTriangle } from 'lucide-react'
import {
  buildOverview,
  driverColor,
  hourColumns,
  type OverviewSlot,
  type TripSummary,
} from '@/lib/transport-trips'

/**
 * ドライバーごとの見取り図（2026-11-17 依頼主「この案で作って」）。
 * その日、だれが何時の便を持っているかを上にまとめて出す。
 * 便を押すと、下の一覧のその便へ移る。
 */
export function DriverOverview({
  trips,
  drivers,
  vehicles,
  shortName,
  partial,
  toggle,
}: {
  trips: TripSummary[]
  drivers: { id: string; name: string }[]
  vehicles: { id: string; name: string }[]
  shortName: Map<string, string>
  /** ユニットで絞りこんでいて、ほかのユニットの便が見えていない */
  partial: boolean
  /** 前の形に戻す切りかえ（見出しの右に出す） */
  toggle?: ReactNode
}) {
  const order = drivers.map((d) => d.id)
  const { lanes, unassigned, mixed } = buildOverview(trips, order)
  const hours = hourColumns(trips)
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]))
  const nameOf = (id: string) => shortName.get(id) ?? drivers.find((d) => d.id === id)?.name ?? '（登録外）'

  const jump = (key: string) => {
    const el = document.getElementById(`trip-${key}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-indigo-400')
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400'), 1600)
  }

  const tripLabel = (t: TripSummary) =>
    `${t.time ?? '時刻なし'} ${t.direction === 'pickup' ? '迎え' : '送り'} ${t.count}人`

  const renderSlot = (slot: OverviewSlot, driverId: string) => {
    const c = driverColor(order, driverId)
    const total = slot.trips.reduce((n, t) => n + t.count, 0)
    const multi = slot.trips.length > 1
    const vNames = [...new Set(slot.trips.map((t) => t.vehicleId).filter((v): v is string => !!v))].map(
      (v) => vehicleName.get(v) ?? '車'
    )
    return (
      <button
        key={slot.trips[0].key}
        type="button"
        onClick={() => jump(slot.trips[0].key)}
        title={(slot.vehicleMismatch ? '1台で回る便なのに、車種がちがいます。' : '') + slot.trips.map((t) => `${tripLabel(t)}：${t.names.join('・')}`).join('\n')}
        data-testid="overview-slot"
        className={`w-full text-left rounded-md border px-1.5 py-1 text-[11px] leading-tight ${c.bg} ${c.text} ${c.border} hover:brightness-95`}
      >
        <span className="font-bold tabular-nums">{slot.time ?? '時刻なし'}</span>{' '}
        {slot.direction === 'pickup' ? '迎え' : '送り'} {total}人
        {multi && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-white/70 px-1 font-semibold" data-testid="two-stops">
            <Route className="h-3 w-3" />
            {slot.trips.length}か所まわり
          </span>
        )}
        {vNames.length > 0 && (
          <span className="mt-0.5 flex items-center gap-0.5 opacity-80">
            <Car className="h-3 w-3" />
            {vNames.join('・')}
          </span>
        )}
        {slot.vehicleMismatch && (
          <span className="mt-0.5 flex items-center gap-0.5 font-semibold text-amber-800" data-testid="vehicle-mismatch">
            <AlertTriangle className="h-3 w-3" />
            車種がちがう
          </span>
        )}
      </button>
    )
  }

  if (trips.length === 0) return null

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" aria-label="ドライバーごとの見取り図" data-testid="driver-overview">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-gray-800">ドライバーごとの見取り図</h2>
        {unassigned.length > 0 ? (
          <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-bold text-red-700" data-testid="unassigned-count">
            未設定 {unassigned.length}便
          </span>
        ) : (
          <span className="rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700" data-testid="unassigned-count">
            未設定 0便
          </span>
        )}
        {mixed.length > 0 && (
          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
            ドライバーがばらばらの便 {mixed.length}
          </span>
        )}
        {partial && <span className="text-[11px] text-gray-400">表示中のユニットの便だけです</span>}
        {toggle && <div className="ml-auto">{toggle}</div>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="w-20 text-left font-medium py-1" />
              {hours.map((h) => (
                <th key={h} className="text-left font-medium py-1 px-1 min-w-[7.5rem]">
                  {h}:00
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => {
              const c = driverColor(order, lane.driverId)
              return (
                <tr key={lane.driverId} className="border-t border-gray-100 align-top" data-testid="overview-lane">
                  <th className="text-left py-1.5 pr-2 font-semibold">
                    <span className={`inline-flex items-center gap-1 ${c.text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${c.solid}`} />
                      {nameOf(lane.driverId)}
                    </span>
                  </th>
                  {hours.map((h) => (
                    <td key={h} className="py-1 px-1 space-y-1">
                      {lane.slots
                        .filter((s) => s.time && Number(s.time.slice(0, 2)) === h)
                        .map((s) => renderSlot(s, lane.driverId))}
                    </td>
                  ))}
                </tr>
              )
            })}
            {unassigned.length > 0 && (
              <tr className="border-t border-gray-100 align-top">
                <th className="text-left py-1.5 pr-2 font-semibold text-red-700">未設定</th>
                {hours.map((h) => (
                  <td key={h} className="py-1 px-1 space-y-1">
                    {unassigned
                      .filter((t) => t.time && Number(t.time.slice(0, 2)) === h)
                      .map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => jump(t.key)}
                          data-testid="unassigned-trip"
                          className="w-full text-left rounded-md border border-dashed border-red-300 bg-red-50 px-1.5 py-1 text-[11px] leading-tight text-red-800 hover:bg-red-100"
                        >
                          <span className="font-bold tabular-nums">{t.time}</span> {t.direction === 'pickup' ? '迎え' : '送り'} {t.count}人
                          <span className="block truncate opacity-80">{t.names.join('・')}</span>
                        </button>
                      ))}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {[...unassigned, ...lanes.flatMap((l) => l.slots.flatMap((s) => s.trips))].some((t) => !t.time) && (
        <p className="text-[11px] text-gray-400">時刻の入っていない便は、見取り図の表には出ません（下の一覧で確かめてください）。</p>
      )}
    </section>
  )
}
