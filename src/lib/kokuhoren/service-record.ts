// 国保連 サービス提供実績記録票（交換情報識別番号 K611）のレコード生成。
// レイアウトはインタフェース仕様書 サービス事業所編（令和7年4月版）2.1.3.6 に基づく。
//   基本情報レコード（レコード種別01）: 172項目
//   明細情報レコード（レコード種別02）: 113項目
// 障害児通所支援の様式種別番号: 0301=児童発達支援 / 0501=放課後等デイサービス
//
// 「設定しない」項目は空欄のまま送る。放課後等デイサービス／児童発達支援で
// 設定する項目のみを埋める（同仕様 2.1.3.6（5）（6）入力必須項目と様式の対応表）。

import { buildFile, num, toShiftJis } from './format'

/** 基本情報レコードの項目数（仕様 2.1.3.6（2）） */
export const BASIC_FIELD_COUNT = 172
/** 明細情報レコードの項目数（仕様 2.1.3.6（3）） */
export const DETAIL_FIELD_COUNT = 113

export const EXCHANGE_ID = 'K611'
/** コントロールレコードのデータ種別 = 交換情報識別番号の上3桁（共通編 1.6） */
export const DATA_KIND = 'K61'

export type FormTypeCode = '0301' | '0501'

export type ServiceRecordDay = {
  /** YYYY-MM-DD */
  date: string
  /** 1=授業の終了後に行う場合 2=休業日に行う場合 */
  serviceFormType: 1 | 2
  /** 'HH:MM'。欠席日は null */
  startTime: string | null
  endTime: string | null
  /** 算定時間数（時間） */
  hours: number
  transportPickup: boolean
  transportDropoff: boolean
  /** 欠席時対応加算を算定する欠席日 */
  absent: boolean
  /** 延長支援加算 0=なし 1=1時間未満 2=1〜2時間未満 3=2時間以上 */
  extensionLevel: 0 | 1 | 2 | 3
}

export type ServiceRecordChild = {
  childName: string
  certificateNumber: string
  /** 受給者証記載の市町村番号（チェックデジット含む6桁） */
  municipalityCode: string
  days: ServiceRecordDay[]
}

export type ServiceRecordResult = {
  errors: string[]
  warnings: string[]
  fileName: string
  bytes: Uint8Array | null
}

/** 時間数 → 整数部＋小数部2桁の数値表現（例: 10.5時間 → "1050"） */
export function hoursCode(hours: number): string {
  return String(Math.round(hours * 100))
}

/** 'HH:MM' → "HHMM"（例: 10:00 → "1000"） */
export function timeCode(time: string): string {
  return time.replace(':', '')
}

function emptyRecord(size: number): string[] {
  return new Array(size).fill('')
}

export function buildServiceRecordCsv(
  facility: { facilityNumber: string; formTypeCode: FormTypeCode },
  serviceYearMonth: string,
  children: ServiceRecordChild[],
): ServiceRecordResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^\d{10}$/.test(facility.facilityNumber)) {
    errors.push(`事業所番号が10桁の数字ではありません: 「${facility.facilityNumber}」（設定 > 施設・ユニット管理で修正）`)
  }
  if (!/^\d{6}$/.test(serviceYearMonth)) {
    errors.push(`サービス提供年月が不正です: ${serviceYearMonth}`)
  }
  if (children.length === 0) {
    errors.push('実績のある児童がありません')
  }

  for (const c of children) {
    const label = c.childName || c.certificateNumber
    if (!/^\d{10}$/.test(c.certificateNumber)) {
      errors.push(`${label}: 受給者証番号が10桁の数字ではありません: 「${c.certificateNumber}」`)
    }
    if (!/^\d{6}$/.test(c.municipalityCode)) {
      errors.push(`${label}: 市町村番号（6桁）が未設定または不正です: 「${c.municipalityCode}」（受給者証編集画面で入力）`)
    }
    if (c.days.length === 0) {
      warnings.push(`${label}: この月の実績がないため、実績記録票を作成しませんでした`)
    }
    const missingTimes = c.days.filter((d) => !d.absent && (!d.startTime || !d.endTime))
    if (missingTimes.length > 0) {
      warnings.push(
        `${label}: 提供時間が未入力の日が${missingTimes.length}日あります（開始・終了時間と算定時間数は空欄で出力）`,
      )
    }
  }

  const fileName = `${EXCHANGE_ID}${serviceYearMonth.slice(2, 6)}.CSV`
  if (errors.length > 0) {
    return { errors, warnings, fileName, bytes: null }
  }

  const ym = serviceYearMonth
  const fac = facility.facilityNumber
  const form = facility.formTypeCode
  const rows: string[][] = []

  for (const c of children) {
    if (c.days.length === 0) continue
    const muni = c.municipalityCode

    // ── 基本情報レコード（レコード種別01） ──
    const basic = emptyRecord(BASIC_FIELD_COUNT)
    basic[0] = EXCHANGE_ID          // 1 交換情報識別番号
    basic[1] = '01'                 // 2 レコード種別コード
    basic[2] = ym                   // 3 サービス提供年月
    basic[3] = muni                 // 4 都道府県等番号
    basic[4] = fac                  // 5 事業所番号
    basic[5] = c.certificateNumber  // 6 受給者証番号
    basic[6] = form                 // 7 様式種別番号

    // 19 合計 算定時間数計（整数3桁＋小数2桁）
    const totalHours = c.days.reduce((s, d) => s + d.hours, 0)
    if (totalHours > 0) basic[18] = hoursCode(totalHours)

    // 34 実績 送迎加算（回）: 片道単位
    const transportCount = c.days.reduce(
      (s, d) => s + (d.transportPickup ? 1 : 0) + (d.transportDropoff ? 1 : 0),
      0,
    )
    if (transportCount > 0) basic[33] = num(transportCount)

    // 170 延長支援加算（回）
    const extensionCount = c.days.filter((d) => d.extensionLevel > 0).length
    if (extensionCount > 0) basic[169] = num(extensionCount)

    rows.push(basic)

    // ── 明細情報レコード（レコード種別02）: 日ごと ──
    for (const d of [...c.days].sort((a, b) => a.date.localeCompare(b.date))) {
      const detail = emptyRecord(DETAIL_FIELD_COUNT)
      detail[0] = EXCHANGE_ID           // 1 交換情報識別番号
      detail[1] = '02'                  // 2 レコード種別コード
      detail[2] = ym                    // 3 サービス提供年月
      detail[3] = muni                  // 4 都道府県等番号
      detail[4] = fac                   // 5 事業所番号
      detail[5] = c.certificateNumber   // 6 受給者証番号
      detail[6] = form                  // 7 様式種別番号
      detail[8] = num(parseInt(d.date.slice(8, 10))) // 9 日付（日）

      if (!d.absent) {
        if (d.startTime) detail[13] = timeCode(d.startTime)   // 14 開始時間
        if (d.endTime) detail[14] = timeCode(d.endTime)       // 15 終了時間
        if (d.hours > 0) detail[15] = hoursCode(d.hours)      // 16 算定時間数
        detail[33] = String(d.serviceFormType)                // 34 提供形態
      } else {
        detail[35] = '8'                                      // 36 サービス提供の状況: 8=欠席
      }

      if (d.transportPickup) detail[20] = '1'                 // 21 送迎加算 往
      if (d.transportDropoff) detail[21] = '1'                // 22 送迎加算 復
      if (d.extensionLevel > 0) detail[110] = String(d.extensionLevel) // 111 延長支援加算

      rows.push(detail)
    }
  }

  if (rows.length === 0) {
    return { errors: ['出力できる実績がありません'], warnings, fileName, bytes: null }
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
