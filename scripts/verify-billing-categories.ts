// 算定時間数・延長支援加算の判定が「放課後等デイサービス 算定入力マニュアル
// （令和6年度改定対応版）」の入力例どおりになるかを検証する。
// 実行: npm run verify:billing

import {
  extensionThresholdMinutes,
  getBillingCategory,
  getExtensionLevel,
} from '../src/lib/billing/day-computation'

type Pattern = {
  label: string
  /** 1=平日（授業終了後） 2=学校休業日 */
  form: 1 | 2
  start: string
  end: string
  /** 期待する算定時間数（実績記録票の入力番号） */
  category: number
  /** 期待する延長支援加算の入力番号（0=なし） */
  extension: number
}

// マニュアル「4．具体的な入力例（よくあるパターン）」の①〜⑧
const PATTERNS: Pattern[] = [
  { label: '① 平日 15:25〜16:30（1時間5分）', form: 1, start: '15:25', end: '16:30', category: 1, extension: 0 },
  { label: '② 平日 14:40〜16:30（1時間50分）', form: 1, start: '14:40', end: '16:30', category: 2, extension: 0 },
  { label: '③ 平日 13:35〜16:30（2時間55分）', form: 1, start: '13:35', end: '16:30', category: 2, extension: 0 },
  { label: '④ 平日 11:55〜16:30（4時間35分）', form: 1, start: '11:55', end: '16:30', category: 3, extension: 2 },
  { label: '⑤ 休業日 10:00〜13:00（3時間）', form: 2, start: '10:00', end: '13:00', category: 2, extension: 0 },
  { label: '⑥ 休業日 10:00〜15:00（5時間）', form: 2, start: '10:00', end: '15:00', category: 3, extension: 0 },
  { label: '⑦ 休業日 10:00〜16:00（6時間）', form: 2, start: '10:00', end: '16:00', category: 4, extension: 2 },
  { label: '⑧ 休業日 9:00〜16:00（7時間）', form: 2, start: '09:00', end: '16:00', category: 4, extension: 3 },
  // マニュアル「3．延長支援加算の入力ルール」の具体例
  { label: '休業日 10:00〜15:45（5時間45分）→延長45分', form: 2, start: '10:00', end: '15:45', category: 4, extension: 1 },
  // 区分の境界（マニュアル「1時間30分ちょうどは1」）
  { label: '平日 15:00〜16:30（ちょうど1時間30分）', form: 1, start: '15:00', end: '16:30', category: 1, extension: 0 },
  { label: '平日 15:00〜15:20（20分・算定対象外）', form: 1, start: '15:00', end: '15:20', category: 0, extension: 0 },
  { label: '休業日 10:00〜13:00 の直後（3時間1分）', form: 2, start: '10:00', end: '13:01', category: 3, extension: 0 },
]

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

let failed = 0
console.log('=== 算定時間数・延長支援加算の判定検証 ===\n')

for (const p of PATTERNS) {
  const minutes = toMinutes(p.end) - toMinutes(p.start)
  const category = getBillingCategory(minutes, true)
  const overMinutes = Math.max(0, minutes - extensionThresholdMinutes(p.form))
  const extension = getExtensionLevel(overMinutes)

  const ok = category === p.category && extension === p.extension
  if (!ok) failed++
  console.log(
    `${ok ? '  ✓' : '  ✗'} ${p.label}: 算定${category}（期待${p.category}） / 延長${extension}（期待${p.extension}）`,
  )
}

console.log('')
if (failed > 0) {
  console.error(`❌ ${failed}件が期待値と一致しませんでした`)
  process.exit(1)
}
console.log('✅ すべてマニュアルどおりに判定されました')
