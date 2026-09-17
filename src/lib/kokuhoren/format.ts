// 国保連 電子請求受付システム インタフェース仕様書（共通編）1.2.2 に基づく
// CSV交換情報ファイルのフレーミング処理。
// ファイル構成: コントロールレコード(1) → データレコード(2)×n → エンドレコード(3)
// 各レコードはカンマ区切り・CRLF終端・Shift-JIS。

import Encoding from 'encoding-japanese'

// 項目内容にカンマ・ダブルコーテーション・スペース・2バイト文字を含む場合のみ
// ダブルコーテーションで囲む（共通編 1.2.2 (4) 特記事項）
export function quoteField(value: string): string {
  if (value === '') return ''
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

/**
 * 小数付き数値項目。整数部・小数部の桁数が決まっている項目は左側をゼロ埋めする。
 * 前システムが取込成功した実データも同じ形（契約支給量 23日 → "02300"）。
 */
export function decimalCode(value: number, intDigits: number, decDigits: number): string {
  const scaled = Math.round(value * 10 ** decDigits)
  return String(scaled).padStart(intDigits + decDigits, '0')
}

/** YYYY-MM-DD → YYYYMMDD */
export function dateCode(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

/** 日（1〜31）→ 2桁ゼロ埋め（例: 1日 → "01"） */
export function dayCode(isoDate: string): string {
  return isoDate.slice(8, 10)
}

/** 単位数単価（円）→ 整数部2桁+小数部3桁の5桁表現（例: 10 → "10000", 11.2 → "11200"） */
export function unitPriceCode(yen: number): string {
  return decimalCode(yen, 2, 3)
}

/** 契約支給量（日数）→ 整数部3桁+小数部2桁の5桁表現（例: 23日 → "02300"） */
export function contractAmountCode(days: number): string {
  return decimalCode(days, 3, 2)
}

// 全角カナ → 半角カナ。濁点・半濁点は2文字に分解する。
const KANA_PAIRS: Array<[string, string]> = [
  ['ガ', 'ｶﾞ'], ['ギ', 'ｷﾞ'], ['グ', 'ｸﾞ'], ['ゲ', 'ｹﾞ'], ['ゴ', 'ｺﾞ'],
  ['ザ', 'ｻﾞ'], ['ジ', 'ｼﾞ'], ['ズ', 'ｽﾞ'], ['ゼ', 'ｾﾞ'], ['ゾ', 'ｿﾞ'],
  ['ダ', 'ﾀﾞ'], ['ヂ', 'ﾁﾞ'], ['ヅ', 'ﾂﾞ'], ['デ', 'ﾃﾞ'], ['ド', 'ﾄﾞ'],
  ['バ', 'ﾊﾞ'], ['ビ', 'ﾋﾞ'], ['ブ', 'ﾌﾞ'], ['ベ', 'ﾍﾞ'], ['ボ', 'ﾎﾞ'],
  ['パ', 'ﾊﾟ'], ['ピ', 'ﾋﾟ'], ['プ', 'ﾌﾟ'], ['ペ', 'ﾍﾟ'], ['ポ', 'ﾎﾟ'],
  ['ヴ', 'ｳﾞ'],
  ['ア', 'ｱ'], ['イ', 'ｲ'], ['ウ', 'ｳ'], ['エ', 'ｴ'], ['オ', 'ｵ'],
  ['カ', 'ｶ'], ['キ', 'ｷ'], ['ク', 'ｸ'], ['ケ', 'ｹ'], ['コ', 'ｺ'],
  ['サ', 'ｻ'], ['シ', 'ｼ'], ['ス', 'ｽ'], ['セ', 'ｾ'], ['ソ', 'ｿ'],
  ['タ', 'ﾀ'], ['チ', 'ﾁ'], ['ツ', 'ﾂ'], ['テ', 'ﾃ'], ['ト', 'ﾄ'],
  ['ナ', 'ﾅ'], ['ニ', 'ﾆ'], ['ヌ', 'ﾇ'], ['ネ', 'ﾈ'], ['ノ', 'ﾉ'],
  ['ハ', 'ﾊ'], ['ヒ', 'ﾋ'], ['フ', 'ﾌ'], ['ヘ', 'ﾍ'], ['ホ', 'ﾎ'],
  ['マ', 'ﾏ'], ['ミ', 'ﾐ'], ['ム', 'ﾑ'], ['メ', 'ﾒ'], ['モ', 'ﾓ'],
  ['ヤ', 'ﾔ'], ['ユ', 'ﾕ'], ['ヨ', 'ﾖ'],
  ['ラ', 'ﾗ'], ['リ', 'ﾘ'], ['ル', 'ﾙ'], ['レ', 'ﾚ'], ['ロ', 'ﾛ'],
  ['ワ', 'ﾜ'], ['ヲ', 'ｦ'], ['ン', 'ﾝ'],
  ['ァ', 'ｧ'], ['ィ', 'ｨ'], ['ゥ', 'ｩ'], ['ェ', 'ｪ'], ['ォ', 'ｫ'],
  ['ャ', 'ｬ'], ['ュ', 'ｭ'], ['ョ', 'ｮ'], ['ッ', 'ｯ'],
  ['ー', 'ｰ'], ['・', '･'], ['。', '｡'], ['、', '､'], ['「', '｢'], ['」', '｣'],
]

/**
 * 氏名カナ項目用。ひらがな・全角カナを半角カナに直し、空白を詰める。
 * 実データ（取込成功分）も姓名を続けて書いた半角カナだった。
 */
export function halfWidthKana(value: string | null | undefined): string {
  if (!value) return ''
  // ひらがな → 全角カタカナ
  const katakana = value.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  )
  let out = ''
  for (const ch of katakana) {
    if (/\s|[　]/.test(ch)) continue
    const hit = KANA_PAIRS.find(([full]) => full === ch)
    out += hit ? hit[1] : ch
  }
  return out
}
