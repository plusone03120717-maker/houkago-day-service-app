// 国保連 電子請求受付システム インタフェース仕様書（共通編）1.2.2 に基づく
// CSV交換情報ファイルのフレーミング処理。
// ファイル構成: コントロールレコード(1) → データレコード(2)×n → エンドレコード(3)
// 各レコードはカンマ区切り・CRLF終端・Shift-JIS。

import Encoding from 'encoding-japanese'

// 項目内容にカンマ・ダブルコーテーション・スペース・2バイト文字を含む場合のみ
// ダブルコーテーションで囲む（共通編 1.2.2 (4) 特記事項）
export function quoteField(value: string): string {
  if (value === '') return ''
  // eslint-disable-next-line no-control-regex
  const needsQuote = /[", ]|[^\x00-\x7F]/.test(value)
  if (!needsQuote) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function buildFile(dataRows: string[][], options: {
  /** 交換情報識別番号の上3桁（例: K11） */
  dataKind: string
  /** 送付元の事業所番号（10桁） */
  facilityNumber: string
  /** 処理対象年月 YYYYMM（国保連で電算処理を実行する年月 = サービス提供月の翌月） */
  processYearMonth: string
}): string {
  const lines: string[] = []
  let recordNo = 1

  // コントロールレコード: 種別1, 連番, ボリューム通番0, データレコード件数,
  // データ種別, 市町村番号0, 事業所番号, 都道府県番号0, 媒体区分1(伝送), 処理対象年月, 予備(未設定)
  lines.push([
    '1',
    String(recordNo++),
    '0',
    String(dataRows.length),
    options.dataKind,
    '0',
    options.facilityNumber,
    '0',
    '1',
    options.processYearMonth,
    '',
  ].map(quoteField).join(','))

  // データレコード: 種別2, 連番, データ...
  for (const row of dataRows) {
    lines.push(['2', String(recordNo++), ...row.map(quoteField)].join(','))
  }

  // エンドレコード: 種別3, 連番
  lines.push(['3', String(recordNo)].join(','))

  return lines.join('\r\n') + '\r\n'
}

export function toShiftJis(text: string): Uint8Array {
  const codes = Encoding.stringToCode(text)
  const sjis = Encoding.convert(codes, { to: 'SJIS', from: 'UNICODE' })
  return new Uint8Array(sjis)
}

/** 数値項目: ゼロは "0"、マイナスは "-" 付き（共通編 1.3.2） */
export function num(value: number): string {
  return String(Math.trunc(value))
}

/** YYYY-MM-DD → YYYYMMDD */
export function dateCode(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

/** 単位数単価（円）→ 整数部2桁+小数部3桁の5桁表現（例: 10 → "10000", 11.2 → "11200"） */
export function unitPriceCode(yen: number): string {
  return String(Math.round(yen * 1000))
}

/** 契約支給量（日数）→ 整数部3桁+小数部2桁の5桁表現（例: 23日 → "2300"） */
export function contractAmountCode(days: number): string {
  return String(Math.round(days * 100))
}
