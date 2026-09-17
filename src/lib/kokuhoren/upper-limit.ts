// 国保連 利用者負担上限額管理結果票（交換情報識別番号 K411）のレコード生成。
// レイアウトは、前システムが取込に成功した実データ（令和8年7月分）に合わせている。
//   基本情報レコード（レコード種別01）: 14項目
//   明細情報レコード（レコード種別02）: 11項目

import { buildFile, num, halfWidthKana, toShiftJis } from './format'

export const EXCHANGE_ID = 'K411'
/** コントロールレコードのデータ種別 = 交換情報識別番号の上3桁 */
export const DATA_KIND = 'K41'

export type UpperLimitOfficeLine = {
  lineNo: number
  officeNumber: string
  officeName: string
  totalCost: number
  copayAmount: number
  managedCopayAmount: number
}

export type UpperLimitChild = {
  childName: string
  childNameKana: string | null
  certificateNumber: string
  /** 受給者証記載の市町村番号（6桁） */
  municipalityCode: string
  copayLimit: number
  /** 1=管理事業所で充当 2=上限月額以下 3=超過のため調整 */
  result: string
  offices: UpperLimitOfficeLine[]
}

export type UpperLimitResult = {
  errors: string[]
  warnings: string[]
  fileName: string
  bytes: Uint8Array | null
}

export function buildUpperLimitCsv(
  facility: { facilityNumber: string },
  serviceYearMonth: string,
  children: UpperLimitChild[],
): UpperLimitResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^\d{10}$/.test(facility.facilityNumber)) {
    errors.push(`事業所番号が10桁の数字ではありません: 「${facility.facilityNumber}」（設定 > 施設・ユニット管理で修正）`)
  }
  if (!/^\d{6}$/.test(serviceYearMonth)) {
    errors.push(`サービス提供年月が不正です: ${serviceYearMonth}`)
  }
  if (children.length === 0) {
    errors.push('当事業所が上限額管理事業所になっている児童がいません')
  }

  for (const c of children) {
    const label = c.childName || c.certificateNumber
    if (!/^\d{10}$/.test(c.certificateNumber)) {
      errors.push(`${label}: 受給者証番号が10桁の数字ではありません: 「${c.certificateNumber}」`)
    }
    if (!/^\d{6}$/.test(c.municipalityCode)) {
      errors.push(`${label}: 市町村番号（6桁）が未設定または不正です（受給者証編集画面で入力）`)
    }
    if (!['1', '2', '3'].includes(c.result)) {
      errors.push(`${label}: 管理結果が未設定です`)
    }
    if (c.offices.length === 0) {
      errors.push(`${label}: 事業所ごとの内訳が1件も入力されていません`)
    }
    for (const o of c.offices) {
      if (!/^\d{10}$/.test(o.officeNumber)) {
        errors.push(`${label}: 項番${o.lineNo}の事業所番号が10桁の数字ではありません: 「${o.officeNumber}」`)
      }
    }
    if (!c.offices.some((o) => o.officeNumber === facility.facilityNumber)) {
      warnings.push(`${label}: 内訳に当事業所（${facility.facilityNumber}）の行がありません`)
    }
    // 管理結果3は「合算額が上限月額を超過するため調整した」ケース
    const sumCopay = c.offices.reduce((s, o) => s + o.copayAmount, 0)
    const sumManaged = c.offices.reduce((s, o) => s + o.managedCopayAmount, 0)
    if (c.result === '3' && sumManaged !== c.copayLimit) {
      warnings.push(
        `${label}: 管理結果3ですが、管理結果後利用者負担額の合計(${sumManaged}円)が負担上限月額(${c.copayLimit}円)と一致しません`,
      )
    }
    if (c.result === '2' && sumCopay > c.copayLimit) {
      warnings.push(
        `${label}: 管理結果2（上限月額以下）ですが、利用者負担額の合計(${sumCopay}円)が負担上限月額(${c.copayLimit}円)を超えています`,
      )
    }
  }

  const fileName = `${EXCHANGE_ID}${serviceYearMonth.slice(2, 6)}.CSV`
  if (errors.length > 0) {
    return { errors, warnings, fileName, bytes: null }
  }

  const ym = serviceYearMonth
  const fac = facility.facilityNumber
  const rows: string[][] = []

  for (const c of children) {
    const kana = halfWidthKana(c.childNameKana)
    const sumCost = c.offices.reduce((s, o) => s + o.totalCost, 0)
    const sumCopay = c.offices.reduce((s, o) => s + o.copayAmount, 0)
    const sumManaged = c.offices.reduce((s, o) => s + o.managedCopayAmount, 0)

    // 基本情報レコード（01）
    rows.push([
      EXCHANGE_ID, '01', ym,
      '1',                              // 給付種別（障害児通所支援）
      c.municipalityCode,
      fac,                              // 上限額管理事業所番号（＝当事業所）
      c.certificateNumber,
      kana,                             // 給付決定保護者カナ
      kana,                             // 障害児カナ
      num(c.copayLimit),
      c.result,
      num(sumCost),
      num(sumCopay),
      num(sumManaged),
    ])

    // 明細情報レコード（02）: 事業所ごと
    for (const o of [...c.offices].sort((a, b) => a.lineNo - b.lineNo)) {
      rows.push([
        EXCHANGE_ID, '02', ym,
        c.municipalityCode,
        fac,
        c.certificateNumber,
        num(o.lineNo),
        o.officeNumber,
        num(o.totalCost),
        num(o.copayAmount),
        num(o.managedCopayAmount),
      ])
    }
  }

  // 処理対象年月 = サービス提供月の翌月
  const y = parseInt(ym.slice(0, 4))
  const m = parseInt(ym.slice(4, 6))
  const processYearMonth = m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`

  const content = buildFile(rows, {
    dataKind: DATA_KIND,
    facilityNumber: fac,
    processYearMonth,
  })

  return { errors, warnings, fileName, bytes: toShiftJis(content) }
}
