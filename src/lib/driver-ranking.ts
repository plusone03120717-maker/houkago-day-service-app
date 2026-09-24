import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * ドライバーの選択肢を「よく入る順」に並べるための点数。
 *
 * 過去の送迎記録（daily_attendance）で、その子のその送迎（お迎え／お送り、
 * 日中一時は別枠）によく入っている人ほど高くなる。自動で値を入れることはせず、
 * 選択肢の並び順にだけ使う。
 *
 * 2026-06〜09 の記録で検証した結果、子ども×方向の傾向に
 * 子ども全体・施設全体の傾向を少し足すのが最もよく当たった
 * （1位的中 約53%、上位2人に正解 約75%）。曜日で分けると記録が薄くなり
 * かえって外れる。タイムカードで絞っても改善しなかったため使っていない。
 *
 * 記録は新しいほど重く数える（2週間で半分）。担当が替わっても
 * 数回運転すれば新しい人が上に来る。
 */
export type TransportSlot = 'pickup' | 'dropoff' | 'daytime_pickup' | 'daytime_dropoff'

/** 児童×送迎枠ごとの、ドライバーID → 点数 */
export type DriverScores = Record<string, number>

const HALF_LIFE_DAYS = 14
/** これより古い記録は重みがほぼ0（0.3%未満）なので読まない */
const LOOKBACK_DAYS = 120
const WEIGHT_SAME_SLOT = 1
const WEIGHT_SAME_CHILD = 0.5
const WEIGHT_ALL = 0.3
/** 記録が1〜2回しかない傾向を強く信じすぎないための下駄 */
const SMOOTHING = 0.5

const SLOT_COLUMNS: Record<TransportSlot, string> = {
  pickup: 'pickup_driver_member_id',
  dropoff: 'dropoff_driver_member_id',
  daytime_pickup: 'daytime_pickup_driver_member_id',
  daytime_dropoff: 'daytime_dropoff_driver_member_id',
}

type Tally = Map<string, number>

export type DriverRanking = {
  scoresFor: (childId: string, slot: TransportSlot) => DriverScores
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

function add(map: Map<string, Tally>, key: string, driverId: string, w: number) {
  let t = map.get(key)
  if (!t) map.set(key, (t = new Map()))
  t.set(driverId, (t.get(driverId) ?? 0) + w)
}

function shares(t: Tally | undefined, weight: number, out: Map<string, number>) {
  if (!t) return
  let total = 0
  for (const v of t.values()) total += v
  for (const [id, v] of t) out.set(id, (out.get(id) ?? 0) + (weight * v) / (total + SMOOTHING))
}

/**
 * `date` より前の送迎記録から点数表を作る。当日の記録は使わない
 * （選んだ直後に並びが入れ替わると、続けて選ぶときに迷うため）。
 */
export async function fetchDriverRanking(
  supabase: SupabaseServerClient,
  date: string
): Promise<DriverRanking> {
  const cols = Object.values(SLOT_COLUMNS)
  const rows: Record<string, string | null>[] = []
  // 1回の取得は最大1000件までなので、足りなくなるまで続けて読む
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('daily_attendance')
      .select(`child_id, date, ${cols.join(', ')}`)
      .gte('date', addDays(date, -LOOKBACK_DAYS))
      .lt('date', date)
      .neq('status', 'absent')
      .or(cols.map((c) => `${c}.not.is.null`).join(','))
      .order('date')
      .range(from, from + 999)
    if (error) {
      // 並び順の補助なので、取れなくても画面は通常の名前順で動かす
      console.error('[driver-ranking] 送迎記録の取得に失敗しました', error)
      break
    }
    rows.push(...((data ?? []) as unknown as Record<string, string | null>[]))
    if (!data || data.length < 1000) break
  }

  const bySlot = new Map<string, Tally>()
  const byChild = new Map<string, Tally>()
  const all: Tally = new Map()
  const lambda = Math.LN2 / HALF_LIFE_DAYS
  for (const r of rows) {
    const childId = r.child_id as string
    const w = Math.exp(-lambda * daysBetween(r.date as string, date))
    for (const [slot, col] of Object.entries(SLOT_COLUMNS)) {
      const driverId = r[col]
      if (!driverId) continue
      add(bySlot, `${childId}|${slot}`, driverId, w)
      add(byChild, childId, driverId, w)
      all.set(driverId, (all.get(driverId) ?? 0) + w)
    }
  }

  return {
    scoresFor(childId, slot) {
      const out = new Map<string, number>()
      shares(bySlot.get(`${childId}|${slot}`), WEIGHT_SAME_SLOT, out)
      shares(byChild.get(childId), WEIGHT_SAME_CHILD, out)
      shares(all, WEIGHT_ALL, out)
      return Object.fromEntries(out)
    },
  }
}

/**
 * 便に乗る児童の点数を足し合わせ、ドライバーを並べ替える。
 * 記録のある人を点数の高い順に、記録の無い人は元の順（名前順）で後ろに続ける。
 */
export function rankDrivers<T extends { id: string }>(
  drivers: T[],
  scoresList: (DriverScores | undefined)[]
): { frequent: T[]; others: T[] } {
  const total = new Map<string, number>()
  for (const scores of scoresList) {
    if (!scores) continue
    for (const [id, v] of Object.entries(scores)) total.set(id, (total.get(id) ?? 0) + v)
  }
  const frequent = drivers
    .filter((d) => (total.get(d.id) ?? 0) > 0)
    .sort((a, b) => (total.get(b.id) ?? 0) - (total.get(a.id) ?? 0))
  const others = drivers.filter((d) => !((total.get(d.id) ?? 0) > 0))
  return { frequent, others }
}
