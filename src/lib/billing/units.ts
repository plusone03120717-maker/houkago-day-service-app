// 単位数計算の共通部品。サーバー（再集計）と画面（上限管理の見込み額）の両方で使うため、
// DB に依存しない純粋な関数だけを置く。

/**
 * 単位数 × 率（％）。1単位未満の端数は四捨五入する（国保連の算定と同じ）。
 * 例: 処遇改善加算 10,693単位 × 16.1% = 1,721.57 → 1,722単位
 * 浮動小数の誤差で .5 の判定がずれないよう、率は小数第3位までの整数にして計算する。
 */
export function unitsByRate(units: number, ratePercent: number): number {
  return Math.round((units * Math.round(ratePercent * 1000)) / 100000)
}

/**
 * 当事業所の総費用額を、利用者負担上限額管理加算の有無で計算し直すための材料。
 * 処遇改善加算は加算を含めた合計に率をかけるので、加算の150単位だけでなく処遇改善の単位数も変わる。
 */
export type SelfCostProjection = {
  /** 処遇改善加算・上限額管理加算を除いた単位数 */
  baseUnits: number
  /** 処遇改善加算の率（％）。算定していなければ 0 */
  treatmentRate: number
  /** 利用者負担上限額管理加算の単位数 */
  additionUnits: number
  /** 単位数単価（円） */
  unitPrice: number
  /** 無償化などで利用者負担が生じない */
  copayExempt: boolean
}

/** 上限額管理加算あり／なしのときの当事業所の総費用額・利用者負担額（上限額管理前） */
export function projectSelfCost(
  p: SelfCostProjection,
  withAddition: boolean,
  copayLimit: number,
): { totalCost: number; copayAmount: number } {
  const subtotal = p.baseUnits + (withAddition ? p.additionUnits : 0)
  const totalUnits = subtotal + (p.treatmentRate > 0 ? unitsByRate(subtotal, p.treatmentRate) : 0)
  const totalCost = Math.floor(totalUnits * p.unitPrice)
  const copayAmount = p.copayExempt ? 0 : Math.min(copayLimit, Math.floor(totalCost / 10))
  return { totalCost, copayAmount }
}
