import { buildUnitBoard } from '@/lib/attendance-board-rows'
import type { loadAttendanceBoardData } from '@/lib/attendance-board-data'

type BoardData = Awaited<ReturnType<typeof loadAttendanceBoardData>>

/**
 * その日に来る予定の児童（出席管理に出る顔ぶれ）を、児童 ID の集合で返す。
 *
 * 送迎の行は、送迎管理を開いたときに、いつもの予定から前もって作られる。そのあとで
 * いつもの予定から曜日が外れても、作ってあった先の日の行は残る（2026-11-19、みとさんの
 * 問い合わせ：スタッフ LINE の送迎に「時間未定」で来ない子が出る）。
 * 出席管理と同じ決まり（buildUnitBoard）で「その日に来る子」を決め、送迎の一覧から
 * それ以外の子の行を分けるのに使う。お休みの連絡があった子も出席管理には出る
 * （欠席として）ので、ここに入る。
 *
 * ユニットごとではなく児童ごとに見る。2つのユニットに入っている子（デイと英会話など）は、
 * 送迎の行が来るほうとは別のユニットに付いていることがあるため（2026-11-25 の本番の
 * データで1件あった）。どのユニットにも来ない子の行だけを外す。
 */
export function expectedChildIds(unitIds: string[], boardDataList: BoardData[], date: string): Set<string> {
  const ids = new Set<string>()
  boardDataList.forEach((data, i) => {
    const board = buildUnitBoard(data, unitIds[i], date)
    for (const r of board.reservations) ids.add(r.child_id)
    for (const a of board.attendances) ids.add(a.child_id)
  })
  return ids
}

/**
 * 送迎の行を「その日に来る子」と「来ない子」に分ける。
 * expected が null（出席管理の顔ぶれを読めなかった）なら分けず、全部を来る子として返す。
 * 読めなかっただけで送迎の一覧から全員が消える事故を防ぐため。
 */
export function splitByExpected<T extends { childId: string }>(
  rows: T[],
  expected: Set<string> | null
): { coming: T[]; notComing: T[] } {
  if (!expected) return { coming: rows, notComing: [] }
  const coming: T[] = []
  const notComing: T[] = []
  for (const r of rows) {
    if (expected.has(r.childId)) coming.push(r)
    else notComing.push(r)
  }
  return { coming, notComing }
}
