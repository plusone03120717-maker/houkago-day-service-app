// 出席した日は「おやつ」「学習教材」を既定で参加（チェック済み）として扱う。
// 日々の記録で外した日は daily_activities に participated=false の行が残るので、その日だけ参加なしになる。
// 請求側（保護者請求書・請求明細・月次実績・国保連集計）はすべてこの関数で参加状況を決める。

export const DEFAULT_PARTICIPATION_PROGRAM_NAMES: readonly string[] = ['おやつ', '学習教材']

export type ActivityParticipationRow = {
  attendance_id: string
  participated: boolean
  activity_programs: { name: string } | null
}

/**
 * 出席ID → 参加した活動名の集合。
 * - attendedAttendanceIds: 出席（attended）の出席ID。ここに入っている日は既定の活動を参加済みとして始める
 * - rows: daily_activities の全行（participated=true/false の両方を渡すこと）
 */
export function participatedNamesByAttendance(
  attendedAttendanceIds: Iterable<string>,
  rows: ActivityParticipationRow[],
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const id of attendedAttendanceIds) {
    result.set(id, new Set(DEFAULT_PARTICIPATION_PROGRAM_NAMES))
  }
  for (const row of rows) {
    const name = row.activity_programs?.name
    if (!name) continue
    const names = result.get(row.attendance_id) ?? new Set<string>()
    if (row.participated) names.add(name)
    else names.delete(name)
    result.set(row.attendance_id, names)
  }
  return result
}
