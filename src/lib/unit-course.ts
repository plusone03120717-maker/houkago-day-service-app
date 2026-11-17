/**
 * スタッフ LINE の送迎タブで絞りこむための区分（デイ・英語・パソコン）。
 * ユニットは「プラスワン1・プラスワン2・児童発達支援・英会話・プログラミング」の5つで、
 * 英会話を「英語」、プログラミングを「パソコン」、それ以外（放デイ・児発）を「デイ」にまとめる。
 * ユニットの名前から決めるので、ユニットが増えても英語・パソコン以外は「デイ」に入る。
 */
export type UnitCourse = 'day' | 'english' | 'pc'

export const UNIT_COURSES: { key: UnitCourse; label: string }[] = [
  { key: 'day', label: 'デイ' },
  { key: 'english', label: '英語' },
  { key: 'pc', label: 'パソコン' },
]

/**
 * 日々の記録（日常記録）を書く教室か。英会話・プログラミングの子は書かない
 * （2026-11-17 依頼主「日々の記録は英会話とプログラミングを外して大丈夫」）。
 * 記録済の数・未記録の数・1画面の一覧から外すのに使う。
 */
export function needsDailyRecord(unitName: string | null | undefined): boolean {
  return unitCourseOf(unitName) === 'day'
}

export function unitCourseOf(unitName: string | null | undefined): UnitCourse {
  const name = unitName ?? ''
  if (name.includes('英')) return 'english'
  if (name.includes('プログラミング') || name.includes('パソコン') || name.toUpperCase().includes('PC')) return 'pc'
  return 'day'
}
