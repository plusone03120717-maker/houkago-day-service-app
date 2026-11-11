/**
 * 承認の履歴画面（スタッフ申請・保護者の利用連絡）で共通に使う小さな関数。
 *
 * 「だれが・いつ」処理したかは migration 180 の reviewed_by / reviewed_at に残る。
 * それより前に処理した分は空なので、画面では「記録なし」と出す。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** ?month=2026-11 を読む。なければ・形が違えば日本時間の今月 */
export function parseMonth(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value
  if (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

/** 月の初日・翌月の初日（YYYY-MM-DD） */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { from: `${month}-01`, to: `${next}-01` }
}

export function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + diff, 1))
  return d.toISOString().slice(0, 7)
}

export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`
}

/** 日本時間の「11/12(木) 14:05」 */
export function formatReviewedAt(iso: string | null): string {
  if (!iso) return '記録なし'
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()]
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dow}) ${hh}:${mm}`
}

/** YYYY-MM-DD を「11/12(木)」に */
export function formatDay(date: string): string {
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(`${date}T00:00:00Z`).getUTCDay()]
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${dow})`
}

/** 処理した人の名前を users からまとめて引く */
export async function loadReviewerNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (unique.length === 0) return names
  // users はスタッフの権限だと自分の行しか読めない（RLS）。
  // スタッフ一覧（staff_members）はスタッフも読めるので、まずそちらの名前を使う
  const { data: staff } = await supabase
    .from('staff_members')
    .select('user_id, name')
    .in('user_id', unique)
  for (const s of (staff ?? []) as { user_id: string; name: string }[]) names.set(s.user_id, s.name)
  const rest = unique.filter((id) => !names.has(id))
  if (rest.length > 0) {
    const { data } = await supabase.from('users').select('id, name').in('id', rest)
    for (const u of (data ?? []) as { id: string; name: string }[]) names.set(u.id, u.name)
  }
  return names
}

/** 処理日時の新しい順。記録のないもの（migration 180 より前）は後ろへ */
export function byReviewedDesc<T extends { reviewed_at: string | null }>(a: T, b: T): number {
  if (a.reviewed_at && b.reviewed_at) return b.reviewed_at.localeCompare(a.reviewed_at)
  if (a.reviewed_at) return -1
  if (b.reviewed_at) return 1
  return 0
}
