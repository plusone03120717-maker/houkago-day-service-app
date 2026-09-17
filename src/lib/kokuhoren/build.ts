// 国保連 障害児通所給付費 請求CSV（K112 請求書 / K122 明細書）のレコード生成。
// レイアウトはインタフェース仕様書 サービス事業所編（令和7年4月版）2.1.3.1 / 2.1.3.2 に基づく。

import {
  buildFile, num, dateCode, unitPriceCode, contractAmountCode, halfWidthKana, toShiftJis,
} from './format'

export type ChildBillingInput = {
  childName: string
  /** 氏名カナ。明細書の保護者カナ・障害児カナに半角カナで出力する */
  childNameKana: string | null
  certificateNumber: string
  /** 受給者証記載の市町村番号（チェックデジット含む6桁） */
  municipalityCode: string
  /** 負担上限月額①（円） */
  copayLimit: number
  totalDays: number
  totalUnits: number
  /** 明細情報レコード用サービスコード（6桁）。内訳がある場合は基本報酬の代表コード */
  serviceCode: string
  /**
   * サービスコード別の内訳（出席実績から再集計したもの）。
   * 空・未指定の場合は 1日あたり単位数×日数 の概算で1行だけ出力する。
   */
  breakdown?: Array<{ code: string; unitCount: number; count: number; units: number }>
  /** 契約情報レコード用 決定サービスコード（6桁） */
  decisionServiceCode: string
  /** 契約支給量（日数） */
  contractDays: number
  contractStartDate: string | null
  contractEndDate: string | null
  contractLineNumber: number
  /**
   * 当事業所を初めて利用した日（受給者証の service_start_date）。
   * 未設定のときのフォールバック用に、出席実績の最古日も受け取る。
   */
  serviceStartDate: string | null
  firstEverServiceDate: string | null
  /** 無償化・軽減等で利用者負担が生じない児童。上限月額調整・決定利用者負担額を0にする */
  copayExempt: boolean
  /** アプリ側で保存されている決定利用者負担額（円）。仕様計算値との差異検出用 */
  storedCopayAmount: number
  upperLimit: { officeNumber: string; result: string; resultAmount: number | null } | null
}

export type FacilityInput = {
  facilityNumber: string
  /** 地域区分コード（2桁） */
  regionCode: string
  /** 単位数単価（円） */
  unitPrice: number
}

export type BuildResult = {
  errors: string[]
  warnings: string[]
  fileName: string
  bytes: Uint8Array | null
}

type ChildComputed = ChildBillingInput & {
  totalCost: number
  tenPercent: number
  capAdjusted: number
  managedCopay: number | null
  decidedCopay: number
  benefitAmount: number
  startDate: string
}

export function buildKokuhorenCsv(
  facility: FacilityInput,
  serviceYearMonth: string,
  childrenInput: ChildBillingInput[],
): BuildResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^\d{10}$/.test(facility.facilityNumber)) {
    errors.push(`事業所番号が10桁の数字ではありません: 「${facility.facilityNumber}」（設定 > 施設・ユニット管理で修正）`)
  }
  if (!/^\d{2}$/.test(facility.regionCode)) {
    errors.push(`地域区分コードが2桁ではありません: 「${facility.regionCode}」`)
  }
  if (!(facility.unitPrice >= 10 && facility.unitPrice <= 11.2)) {
    errors.push(`単位数単価が10.000〜11.200円の範囲外です: ${facility.unitPrice}`)
  }
  if (!/^\d{6}$/.test(serviceYearMonth)) {
    errors.push(`サービス提供年月が不正です: ${serviceYearMonth}`)
  }
  if (childrenInput.length === 0) {
    errors.push('請求対象の児童がありません')
  }

  const monthFirstDay = `${serviceYearMonth.slice(0, 4)}-${serviceYearMonth.slice(4, 6)}-01`

  const children: ChildComputed[] = childrenInput.map((c) => {
    const label = c.childName || c.certificateNumber
    if (!/^\d{10}$/.test(c.certificateNumber)) {
      errors.push(`${label}: 受給者証番号が10桁の数字ではありません: 「${c.certificateNumber}」`)
    }
    if (!/^\d{6}$/.test(c.municipalityCode)) {
      errors.push(`${label}: 市町村番号（6桁）が未設定または不正です: 「${c.municipalityCode}」（受給者証編集画面で入力）`)
    }
    if (!/^[0-9A-Z]{6}$/.test(c.serviceCode)) {
      errors.push(
        `${label}: サービスコードが6桁の英数字ではありません: 「${c.serviceCode}」（請求明細画面の児童行の鉛筆アイコンから6桁のコードを入力してください）`,
      )
    }
    if (!/^[0-9A-Z]{6}$/.test(c.decisionServiceCode)) {
      errors.push(`${label}: 決定サービスコードが6桁の英数字ではありません: 「${c.decisionServiceCode}」（受給者証編集画面で入力）`)
    }
    if (c.totalDays <= 0) {
      errors.push(`${label}: 利用日数が0日です`)
    }
    if (c.contractDays <= 0) {
      errors.push(`${label}: 契約支給量（日数）が未設定です（受給者証編集画面で入力）`)
    }

    // 開始年月日: 当事業所を初めて利用した日をそのまま出す。
    // 当月1日でも受給者証の契約開始日でもない（取込成功済みの実データで確認）。
    let startDate: string
    if (c.serviceStartDate) {
      startDate = c.serviceStartDate
    } else if (c.firstEverServiceDate) {
      startDate = c.firstEverServiceDate
      warnings.push(
        `${label}: サービス開始年月日が未設定のため、出席実績の最も古い日（${startDate}）を使いました（受給者証編集画面で入力してください）`,
      )
    } else if (c.contractStartDate) {
      startDate = c.contractStartDate
      warnings.push(
        `${label}: サービス開始年月日が未設定のため、契約開始日（${startDate}）を使いました（受給者証編集画面で入力してください）`,
      )
    } else {
      startDate = monthFirstDay
      warnings.push(`${label}: サービス開始年月日が特定できないため開始年月日を${monthFirstDay}としました`)
    }
    if (!c.contractStartDate) {
      warnings.push(`${label}: 契約開始日が未設定のため、契約情報レコードには開始年月日（${startDate}）を設定しました`)
    }

    // 仕様に基づく利用者負担額の算定（円未満切り捨て）
    const totalCost = Math.floor(c.totalUnits * facility.unitPrice)
    const tenPercent = Math.floor(totalCost / 10)
    // 無償化・軽減対象は上限月額調整も0になる（実データで確認）
    const capAdjusted = c.copayExempt ? 0 : Math.min(c.copayLimit, tenPercent)
    // 上限額管理がある場合、決定利用者負担額は管理結果額そのもの。
    // 管理結果1（管理事業所が充当）・2（上限以下）・3（超過調整）のいずれでも同じ扱い。
    const managedCopay = c.upperLimit && c.upperLimit.resultAmount != null
      ? c.upperLimit.resultAmount
      : null
    if (c.upperLimit && c.upperLimit.resultAmount == null) {
      errors.push(
        `${label}: 上限額管理事業所が設定されていますが、管理結果額が未入力です（請求明細画面で入力してください）`,
      )
    }
    const decidedCopay = managedCopay ?? capAdjusted
    const benefitAmount = totalCost - decidedCopay

    if (c.storedCopayAmount !== decidedCopay) {
      warnings.push(
        `${label}: アプリの利用者負担額(${c.storedCopayAmount}円)と仕様計算値(${decidedCopay}円 = min(1割相当額, 負担上限月額))が異なります。CSVには仕様計算値を出力しました`,
      )
    }
    const lines = c.breakdown ?? []
    if (lines.length > 0) {
      for (const line of lines) {
        if (!/^[0-9A-Z]{6}$/.test(line.code)) {
          errors.push(`${label}: 内訳のサービスコードが6桁の英数字ではありません: 「${line.code}」`)
        }
      }
      const sum = lines.reduce((s, l) => s + l.units, 0)
      if (sum !== c.totalUnits) {
        warnings.push(
          `${label}: サービスコード別内訳の合計(${sum})が単位数(${c.totalUnits})と一致しません。内訳の合計でCSVを作成しました`,
        )
      }
    } else {
      const perDay = c.totalDays > 0 ? Math.round(c.totalUnits / c.totalDays) : 0
      if (perDay * c.totalDays !== c.totalUnits) {
        warnings.push(
          `${label}: サービスコード別内訳が概算です（1日あたり単位数×日数がサービス単位数と一致しません）。「出席実績から再集計」を実行すると内訳どおりに出力されます`,
        )
      }
    }

    return { ...c, totalCost, tenPercent, capAdjusted, managedCopay, decidedCopay, benefitAmount, startDate }
  })

  const fileName = `K112${serviceYearMonth.slice(2, 6)}.CSV`

  if (errors.length > 0) {
    return { errors, warnings, fileName, bytes: null }
  }

  // 市町村（請求先）ごとに請求書1枚＋明細書n枚
  const byMunicipality = new Map<string, ChildComputed[]>()
  for (const c of children) {
    const list = byMunicipality.get(c.municipalityCode) ?? []
    list.push(c)
    byMunicipality.set(c.municipalityCode, list)
  }

  const rows: string[][] = []
  const ym = serviceYearMonth
  const fac = facility.facilityNumber

  for (const [muni, group] of byMunicipality) {
    const count = group.length
    const sumUnits = group.reduce((s, c) => s + c.totalUnits, 0)
    const sumCost = group.reduce((s, c) => s + c.totalCost, 0)
    const sumBenefit = group.reduce((s, c) => s + c.benefitAmount, 0)
    const sumCopay = group.reduce((s, c) => s + c.decidedCopay, 0)

    // K112 請求書 基本情報レコード（レコード種別01）
    rows.push([
      'K112', '01', ym, muni, fac,
      num(sumBenefit),                                  // 請求金額
      num(count), num(sumUnits), num(sumCost), num(sumBenefit), // 小計（障害児給付費）
      '',                                               // 特別対策費請求額
      num(sumCopay),                                    // 小計 利用者負担額
      '0',                                              // 自治体助成額
      '0', '0', '0',                                    // 特定入所障害児食費等・高額
      num(count), num(sumUnits), num(sumCost), num(sumBenefit), // 合計
      '0',                                              // 合計 特別対策費請求額
      num(sumCopay),                                    // 合計 利用者負担額
      '0',                                              // 合計 自治体助成額
    ])

    // K112 請求書 明細情報レコード（レコード種別02）: 給付種別1・サービス種類ごと。
    // 同じ事業所番号で児童発達支援(61)と放課後等デイサービス(63)の両方を行う場合、
    // 請求書は1枚のまま明細情報レコードだけサービス種類ごとに分かれる。
    const byServiceKind = new Map<string, ChildComputed[]>()
    for (const c of group) {
      const kind = c.serviceCode.slice(0, 2)
      const list = byServiceKind.get(kind) ?? []
      list.push(c)
      byServiceKind.set(kind, list)
    }
    for (const [kind, kindGroup] of [...byServiceKind].sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push([
        'K112', '02', ym, muni, fac,
        '1',
        kind,
        num(kindGroup.length),
        num(kindGroup.reduce((s, c) => s + c.totalUnits, 0)),
        num(kindGroup.reduce((s, c) => s + c.totalCost, 0)),
        num(kindGroup.reduce((s, c) => s + c.benefitAmount, 0)),
        '0',                                            // 特別対策費請求額
        num(kindGroup.reduce((s, c) => s + c.decidedCopay, 0)),
        '0',                                            // 自治体助成額
      ])
    }

    for (const c of group) {
      const serviceKind = c.serviceCode.slice(0, 2)

      // K122 明細書 基本情報レコード（01）
      rows.push([
        'K122', '01', ym, muni, fac, c.certificateNumber,
        '',                                             // 助成自治体番号
        halfWidthKana(c.childNameKana),                 // 給付決定保護者カナ
        halfWidthKana(c.childNameKana),                 // 障害児カナ
        facility.regionCode,
        '',                                             // 就労継続支援A型減免（設定しない）
        num(c.copayLimit),                              // 利用者負担上限月額①
        '', '',                                         // A型減免対象・障害支援区分（設定しない）
        c.upperLimit?.officeNumber ?? '',
        c.upperLimit?.result ?? '',
        c.upperLimit?.resultAmount != null ? num(c.upperLimit.resultAmount) : '',
        '', '',                                         // 日中支援加算欄（設定しない）
        num(c.totalUnits),                              // 合計 給付単位数
        num(c.totalCost),                               // 合計 総費用額
        num(c.capAdjusted),                             // 合計 上限月額調整
        '', '',                                         // A型減免（設定しない）
        '',                                             // 調整後利用者負担額
        c.managedCopay != null ? num(c.managedCopay) : '', // 上限額管理後利用者負担額
        num(c.decidedCopay),                            // 決定利用者負担額
        num(c.benefitAmount),                           // 請求額 給付費
        '0', '0',                                       // 高額障害児通所給付費・特別対策費
        '',                                             // 自治体助成分請求額
        '0', '0', '0', '0',                             // 特定入所障害児食費等・実費算定額
      ])

      // K122 明細書 日数情報レコード（02）
      rows.push([
        'K122', '02', ym, muni, fac, c.certificateNumber,
        serviceKind,
        dateCode(c.startDate),                          // 開始年月日（当事業所の初回利用日）
        '',                                             // 終了年月日（月末在籍中は省略）
        num(c.totalDays),
        '', '',                                         // 入院日数・外泊日数
      ])

      // K122 明細書 明細情報レコード（03）: サービスコードごとに1行
      const detailLines = c.breakdown && c.breakdown.length > 0
        ? c.breakdown.map((l) => ({ code: l.code, unitCount: l.unitCount, count: l.count, units: l.units }))
        : [{
            code: c.serviceCode,
            unitCount: c.totalDays > 0 ? Math.round(c.totalUnits / c.totalDays) : c.totalUnits,
            count: c.totalDays,
            units: c.totalUnits,
          }]
      for (const line of detailLines) {
        rows.push([
          'K122', '03', ym, muni, fac, c.certificateNumber,
          line.code,
          num(line.unitCount),                          // 単位数（サービスコード1回あたり）
          num(line.count),                              // 回数
          num(line.units),                              // サービス単位数
          '',                                           // 摘要
        ])
      }

      // K122 明細書 集計情報レコード（04）
      rows.push([
        'K122', '04', ym, muni, fac, c.certificateNumber,
        serviceKind,
        '1',                                            // 集計欄分類番号
        num(c.totalDays),                               // サービス利用日数
        num(c.totalUnits),                              // 給付単位数
        unitPriceCode(facility.unitPrice),              // 単位数単価
        '0',                                            // 給付率
        num(c.totalCost),                               // 総費用額
        num(c.tenPercent),                              // 1割相当額
        num(c.tenPercent),                              // 利用者負担額②
        num(c.capAdjusted),                             // 上限月額調整
        '', '',                                         // A型減免（設定しない）
        '',                                             // 調整後利用者負担額
        c.managedCopay != null ? num(c.managedCopay) : '', // 上限額管理後利用者負担額
        num(c.decidedCopay),                            // 決定利用者負担額
        num(c.benefitAmount),                           // 請求額 給付費
        '0',                                            // 高額障害児通所給付費
        '', '',                                         // 特別対策費・自治体助成分請求額
        '0', '0', '0', '0',                             // 特定入所障害児食費等・実費算定額
        '', '', '', '',                                 // 利用日数管理票（設定しない）
      ])

      // K122 明細書 契約情報レコード（05）
      rows.push([
        'K122', '05', ym, muni, fac, c.certificateNumber,
        c.decisionServiceCode,
        contractAmountCode(c.contractDays),
        dateCode(c.contractStartDate ?? c.startDate),
        c.contractEndDate ? dateCode(c.contractEndDate) : '',
        num(c.contractLineNumber),
      ])
    }
  }

  // 処理対象年月 = サービス提供月の翌月（国保連で電算処理を実行する年月）
  const y = parseInt(ym.slice(0, 4))
  const m = parseInt(ym.slice(4, 6))
  const processYearMonth = m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, '0')}`

  const content = buildFile(rows, {
    dataKind: 'K11',
    facilityNumber: fac,
    processYearMonth,
  })

  return { errors, warnings, fileName, bytes: toShiftJis(content) }
}
