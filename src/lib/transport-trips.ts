/**
 * 送迎管理の「ドライバーごとの見取り図」と「1タップのボタン」のための計算（2026-11-17 依頼主「この案で作って」）。
 *
 * 配車係の回答（2026-11-17）:
 *  - 入れ直しが多いのは、全体を見ながら組み合わせているから → その日の全体を一目で見せる
 *  - 紙に書き出さず PC の画面だけで配分している → 見取り図は画面の中に置く
 *  - 同じ人が同じ時刻に2便を持つ日は、1台でそのまま2か所を回る → まちがいとして出さず「2か所まわり」と並べる
 *  - 車種の欄は活用したい → 車種もボタンで選べるようにし、同じ時刻の2便目は車種も同じにする
 *
 * 画面の部品に依存しないよう、便の最小限の形だけを受け取る。
 */

export type TripDirection = 'pickup' | 'dropoff'

/** 便の中の児童1人分（必要な項目だけ） */
export type TripMember = {
  name: string
  time: string | null
  isAbsent: boolean
  driverMemberId: string | null
  vehicleId: string | null
}

export type TripInput = {
  key: string
  direction: TripDirection
  rows: TripMember[]
}

/** 見取り図に出す便1つ */
export type TripSummary = {
  key: string
  direction: TripDirection
  /** 便の時刻（欠席でない児童の早いほう）。なければ null */
  time: string | null
  /** 便のドライバー。児童ごとにばらばら（混在）なら null で mixedDriver が true */
  driverId: string | null
  mixedDriver: boolean
  vehicleId: string | null
  /** 欠席でない児童の数 */
  count: number
  names: string[]
}

function shared<T>(values: T[]): { value: T | null; mixed: boolean } {
  if (values.length === 0) return { value: null, mixed: false }
  const first = values[0]
  const same = values.every((v) => v === first)
  return { value: same ? first : null, mixed: !same }
}

/** 便ごとにまとめる。全員欠席の便は外す */
export function summarizeTrips(groups: TripInput[]): TripSummary[] {
  const out: TripSummary[] = []
  for (const g of groups) {
    const live = g.rows.filter((r) => !r.isAbsent)
    if (live.length === 0) continue
    const times = live.map((r) => r.time).filter((t): t is string => !!t).sort()
    const driver = shared(live.map((r) => r.driverMemberId))
    const vehicle = shared(live.map((r) => r.vehicleId))
    out.push({
      key: g.key,
      direction: g.direction,
      time: times[0] ?? null,
      driverId: driver.value,
      mixedDriver: driver.mixed,
      vehicleId: vehicle.value,
      count: live.length,
      names: live.map((r) => r.name),
    })
  }
  return out
}

/** 同じドライバー・同じ時刻・同じ区分の便のまとまり（1台で回る） */
export type OverviewSlot = {
  time: string | null
  direction: TripDirection
  trips: TripSummary[]
  /** 1台で回るのに、便ごとに違う車種が入っている */
  vehicleMismatch: boolean
}

export type OverviewLane = {
  driverId: string
  slots: OverviewSlot[]
}

const byTime = (a: { time: string | null }, b: { time: string | null }) =>
  (a.time ?? '99:99').localeCompare(b.time ?? '99:99')

/**
 * ドライバーごとの並び。ドライバーの順は `driverOrder`（名前順）のまま。
 * 同じ人・同じ時刻・同じ区分の便は1つのまとまり（2か所まわり）にする。
 */
export function buildOverview(trips: TripSummary[], driverOrder: string[]): {
  lanes: OverviewLane[]
  unassigned: TripSummary[]
  mixed: TripSummary[]
} {
  const byDriver = new Map<string, TripSummary[]>()
  const unassigned: TripSummary[] = []
  const mixed: TripSummary[] = []
  for (const t of trips) {
    if (t.mixedDriver) mixed.push(t)
    else if (!t.driverId) unassigned.push(t)
    else {
      const list = byDriver.get(t.driverId) ?? []
      list.push(t)
      byDriver.set(t.driverId, list)
    }
  }
  const order = [...driverOrder, ...[...byDriver.keys()].filter((id) => !driverOrder.includes(id))]
  const lanes: OverviewLane[] = []
  for (const driverId of order) {
    const list = byDriver.get(driverId)
    if (!list) continue
    const slots: OverviewSlot[] = []
    for (const t of [...list].sort(byTime)) {
      const slot = slots.find((s) => s.time !== null && s.time === t.time && s.direction === t.direction)
      if (slot) slot.trips.push(t)
      else slots.push({ time: t.time, direction: t.direction, trips: [t], vehicleMismatch: false })
    }
    for (const s of slots) {
      const set = new Set(s.trips.map((t) => t.vehicleId).filter(Boolean))
      s.vehicleMismatch = set.size > 1
    }
    lanes.push({ driverId, slots })
  }
  return { lanes, unassigned: unassigned.sort(byTime), mixed: mixed.sort(byTime) }
}

/** 見取り図の列（時台）。便のある時台だけを早い順に */
export function hourColumns(trips: TripSummary[]): number[] {
  const hours = new Set<number>()
  for (const t of trips) if (t.time) hours.add(Number(t.time.slice(0, 2)))
  return [...hours].sort((a, b) => a - b)
}

/**
 * ドライバーを選んだ便に、車種も合わせて入れるか。
 * 同じ人が同じ時刻・同じ区分のほかの便に車種を入れていれば、その車種を返す（1台で2か所を回るため）。
 * この便にもう車種が入っているとき・見つからないときは null。
 */
export function followVehicle(trips: TripSummary[], tripKey: string, driverId: string): string | null {
  const me = trips.find((t) => t.key === tripKey)
  if (!me || me.vehicleId || !me.time) return null
  const other = trips.find(
    (t) => t.key !== tripKey && t.driverId === driverId && t.time === me.time && t.direction === me.direction && t.vehicleId
  )
  return other?.vehicleId ?? null
}

/** ドライバーの色。名前順の位置で決めるので、日をまたいでも同じ色になる */
export const DRIVER_COLORS = [
  { bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-300', solid: 'bg-sky-600' },
  { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300', solid: 'bg-amber-600' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300', solid: 'bg-emerald-600' },
  { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300', solid: 'bg-rose-600' },
  { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-300', solid: 'bg-violet-600' },
  { bg: 'bg-lime-100', text: 'text-lime-900', border: 'border-lime-300', solid: 'bg-lime-700' },
  { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300', solid: 'bg-orange-600' },
  { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300', solid: 'bg-teal-600' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', border: 'border-fuchsia-300', solid: 'bg-fuchsia-600' },
  { bg: 'bg-stone-200', text: 'text-stone-900', border: 'border-stone-400', solid: 'bg-stone-600' },
] as const

export function driverColor(driverOrder: string[], id: string) {
  const i = driverOrder.indexOf(id)
  return DRIVER_COLORS[(i < 0 ? 0 : i) % DRIVER_COLORS.length]
}

/** ボタンに出す短い名前（名字だけ）。名字が同じ人がいるときは名前まで出す */
export function shortNames<T extends { id: string; name: string }>(drivers: T[]): Map<string, string> {
  const family = (n: string) => n.trim().split(/[\s　]+/)[0] || n
  const count = new Map<string, number>()
  for (const d of drivers) count.set(family(d.name), (count.get(family(d.name)) ?? 0) + 1)
  return new Map(drivers.map((d) => [d.id, (count.get(family(d.name)) ?? 0) > 1 ? d.name : family(d.name)]))
}

/** ボタンで出す候補の人数（2026-11-17 依頼主「予測される候補上位3人」） */
export const CANDIDATE_COUNT = 3

/**
 * 便ごとのボタンの候補。
 *  1. その便の子のこれまでの記録から「よく入る順」の上位3人
 *  2. 記録が足りず3人にならないときは、最近よく運転している人（名前順）で足す
 *  3. 選ばれている人が候補にいなければ、その人もボタンに出す（だれが選ばれているか見えるように）
 * ほかの人は「その他」から選ぶ。
 */
export function candidateDrivers<T extends { id: string }>(
  drivers: T[],
  rankedIds: string[],
  regularIds: string[],
  selectedId: string | null,
  n: number = CANDIDATE_COUNT
): { buttons: T[]; others: T[] } {
  const byId = new Map(drivers.map((d) => [d.id, d]))
  const picked: string[] = []
  for (const id of [...rankedIds, ...drivers.map((d) => d.id).filter((id) => regularIds.includes(id))]) {
    if (picked.length >= n) break
    if (byId.has(id) && !picked.includes(id)) picked.push(id)
  }
  if (selectedId && byId.has(selectedId) && !picked.includes(selectedId)) picked.push(selectedId)
  return {
    buttons: picked.map((id) => byId.get(id)!),
    others: drivers.filter((d) => !picked.includes(d.id)),
  }
}
