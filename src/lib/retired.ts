/**
 * 辞めたスタッフ・使わなくなった車を、消さずに選ぶ欄から外す（2026-11-17 依頼主「作って」）。
 *
 * retired_at（退職日・使わなくなった日）が入っている人・車は、その翌日から外す。
 * ただし、表示している記録にもう入っている人・車は残す（過去の記録の名前が消えないように）。
 *
 * 各画面の読みこみはそのままにし、退職した人・使わない車だけを別に読む。
 * 列がまだない環境（マイグレーションの前）では「だれも退職していない」として動く。
 */

type Client = {
  from: (table: string) => {
    select: (cols: string) => {
      not: (col: string, op: string, value: null) => PromiseLike<{ data: unknown; error: unknown }>
    }
  }
}

export type RetiredMaps = {
  /** スタッフの id → 退職日 */
  staff: Map<string, string>
  /** 車の id → 使わなくなった日 */
  vehicles: Map<string, string>
}

async function loadMap(supabase: Client, table: string): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.from(table).select('id, retired_at').not('retired_at', 'is', null)
    if (error || !Array.isArray(data)) return new Map()
    return new Map((data as { id: string; retired_at: string }[]).map((r) => [r.id, r.retired_at]))
  } catch {
    return new Map()
  }
}

export async function loadRetired(supabase: unknown): Promise<RetiredMaps> {
  const c = supabase as Client
  const [staff, vehicles] = await Promise.all([loadMap(c, 'staff_members'), loadMap(c, 'transport_vehicles')])
  return { staff, vehicles }
}

/** その日には外すか（退職日・使わなくなった日の翌日から外す） */
export function isRetiredOn(retiredAt: string | null | undefined, date: string): boolean {
  return !!retiredAt && retiredAt < date
}

/**
 * 選ぶ欄に出す人・車。`date` に外れている人・車を除く。`keep` に入っている id は残す。
 */
export function keepActive<T extends { id: string }>(
  list: T[],
  retired: Map<string, string>,
  date: string,
  keep: Iterable<string | null | undefined> = []
): T[] {
  if (retired.size === 0) return list
  const keepSet = new Set([...keep].filter((v): v is string => !!v))
  return list.filter((x) => keepSet.has(x.id) || !isRetiredOn(retired.get(x.id), date))
}

/** 記録の行から、送迎のドライバー・車の id を集める（*_driver_member_id・*_vehicle_id・driverMemberId・vehicleId） */
export function transportIdsIn(rows: unknown[]): { drivers: Set<string>; vehicles: Set<string> } {
  const drivers = new Set<string>()
  const vehicles = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (typeof v !== 'string' || !v) continue
      if (k.endsWith('driver_member_id') || k === 'driverMemberId') drivers.add(v)
      else if (k.endsWith('vehicle_id') || k === 'vehicleId') vehicles.add(v)
    }
  }
  return { drivers, vehicles }
}

/** 今日（日本時間）の 'YYYY-MM-DD' */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
