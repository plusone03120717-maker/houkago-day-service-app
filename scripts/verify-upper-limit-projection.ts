// 上限管理画面の「当事業所の総費用額（上限額管理加算込みの見込み）」が、
// 国保連の明細書・他事業所の計算と一致するかを実データの数字で確かめる。
//   npx tsx scripts/verify-upper-limit-projection.ts
import { projectSelfCost, unitsByRate } from '../src/lib/billing/units'

const cases = [
  // 小池凌生 9月の明細書（確認リスト）: 10,693単位 × 16.1% → 処遇改善 1,722単位
  { label: '処遇改善の四捨五入（小池凌生 9月）', actual: unitsByRate(10693, 16.1), expected: 1722 },
  // 桑原明日輝 9月: 保存前の請求明細は 12,161単位（121,610円）。加算込みは 123,360円（他事業所の計算と一致）
  {
    label: '桑原明日輝 加算なし',
    actual: projectSelfCost({ baseUnits: 12161 - 1686, treatmentRate: 16.1, additionUnits: 150, unitPrice: 10, copayExempt: false }, false, 4600).totalCost,
    expected: 121610,
  },
  {
    label: '桑原明日輝 加算込み',
    actual: projectSelfCost({ baseUnits: 12161 - 1686, treatmentRate: 16.1, additionUnits: 150, unitPrice: 10, copayExempt: false }, true, 4600).totalCost,
    expected: 123360,
  },
  // 遠藤虎太郎 9月: 加算込みで 48,530円（4,853単位 = 基本等 4,030 + 加算150 + 処遇改善 673）
  {
    label: '遠藤虎太郎 加算込み',
    actual: projectSelfCost({ baseUnits: 4853 - 673 - 150, treatmentRate: 16.1, additionUnits: 150, unitPrice: 10, copayExempt: false }, true, 4600).totalCost,
    expected: 48530,
  },
  {
    label: '負担額は上限月額で頭打ち',
    actual: projectSelfCost({ baseUnits: 10475, treatmentRate: 16.1, additionUnits: 150, unitPrice: 10, copayExempt: false }, true, 4600).copayAmount,
    expected: 4600,
  },
]

let failed = 0
for (const c of cases) {
  const ok = c.actual === c.expected
  if (!ok) failed++
  console.log(`${ok ? 'OK ' : 'NG '} ${c.label}: ${c.actual}（期待値 ${c.expected}）`)
}
if (failed > 0) process.exit(1)
