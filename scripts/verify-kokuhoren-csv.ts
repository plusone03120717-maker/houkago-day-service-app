import { buildKokuhorenCsv, type ChildBillingInput } from '../src/lib/kokuhoren/build'
import Encoding from 'encoding-japanese'
import { writeFileSync } from 'node:fs'

// 仕様書（サービス事業所編 2.1.3.1 / 2.1.3.2）が定めるレコードごとの項目数
const EXPECTED_FIELDS: Record<string, number> = {
  'K112-01': 23, // 請求書 基本情報
  'K112-02': 14, // 請求書 明細情報
  'K122-01': 35, // 明細書 基本情報
  'K122-02': 12, // 明細書 日数情報
  'K122-03': 11, // 明細書 明細情報
  'K122-04': 33, // 明細書 集計情報
  'K122-05': 11, // 明細書 契約情報
}

const RECORD_LABEL: Record<string, string> = {
  'K112-01': '請求書 基本情報',
  'K112-02': '請求書 明細情報',
  'K122-01': '明細書 基本情報',
  'K122-02': '明細書 日数情報',
  'K122-03': '明細書 明細情報',
  'K122-04': '明細書 集計情報',
  'K122-05': '明細書 契約情報',
}

// 擬似データ: 通常・上限0円・上限額管理・別市町村・児発混在・無償化 を網羅
const children: ChildBillingInput[] = [
  {
    // 通常ケース（負担上限4,600円・継続契約）+ 出席実績から再集計したサービスコード別内訳あり
    childName: '検証 太郎', childNameKana: 'ケンショウ タロウ',
    certificateNumber: '1942330391', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 12, totalUnits: 7044, serviceCode: '631111',
    breakdown: [
      { code: '631111', unitCount: 587, count: 10, units: 5870 }, // 平日・区分2
      { code: '631112', unitCount: 587, count: 2, units: 1174 },  // 休日・区分2
    ],
    decisionServiceCode: '631000', contractDays: 23, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 1,
    serviceStartDate: '2022-01-01', firstEverServiceDate: '2022-03-01', copayExempt: false,
    storedCopayAmount: 4600, upperLimit: null,
  },
  {
    // 負担上限0円（生活保護・非課税世帯）
    childName: '検証 花子', childNameKana: 'ケンショウ ハナコ',
    certificateNumber: '1942330392', municipalityCode: '194233',
    copayLimit: 0, totalDays: 8, totalUnits: 4696, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 15, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 1,
    serviceStartDate: '2026-04-01', firstEverServiceDate: '2026-04-03', copayExempt: false,
    storedCopayAmount: 0, upperLimit: null,
  },
  {
    // 上限額管理あり（管理結果1: 管理事業所が充当したので当事業所の負担は0）
    childName: '検証 次郎', childNameKana: 'ケンショウ ジロウ',
    certificateNumber: '1942330393', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 10, totalUnits: 5870, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 20, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 2,
    serviceStartDate: '2024-10-01', firstEverServiceDate: '2024-10-01', copayExempt: false,
    storedCopayAmount: 3000,
    upperLimit: { officeNumber: '1310000099', result: '1', resultAmount: 0 },
  },
  {
    // 同じ市町村・同じ事業所番号の児童発達支援（請求書の明細情報がサービス種類で分かれる）
    childName: '検証 四郎', childNameKana: 'ケンショウ シロウ',
    certificateNumber: '1942330394', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 6, totalUnits: 1282, serviceCode: '611111',
    decisionServiceCode: '611000', contractDays: 10, contractStartDate: '2025-04-01',
    contractEndDate: null, contractLineNumber: 1,
    serviceStartDate: '2025-04-08', firstEverServiceDate: '2025-04-08', copayExempt: false,
    storedCopayAmount: 1282, upperLimit: null,
  },
  {
    // 無償化対象（負担上限月額は4,600円のまま、上限月額調整・決定利用者負担額は0）
    childName: '検証 五郎', childNameKana: 'ケンショウ ゴロウ',
    certificateNumber: '1942330395', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 9, totalUnits: 5000, serviceCode: '611111',
    decisionServiceCode: '611000', contractDays: 12, contractStartDate: '2025-04-01',
    contractEndDate: null, contractLineNumber: 1,
    serviceStartDate: '2025-04-10', firstEverServiceDate: '2025-04-10', copayExempt: true,
    storedCopayAmount: 0, upperLimit: null,
  },
  {
    // 別市町村 + 月途中契約開始（請求書が市町村ごとに分かれることの検証）
    childName: '検証 三郎', childNameKana: 'ケンショウ サブロウ',
    certificateNumber: '1310160001', municipalityCode: '131016',
    copayLimit: 37200, totalDays: 5, totalUnits: 2935, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 23, contractStartDate: '2026-07-06',
    contractEndDate: null, contractLineNumber: 1,
    serviceStartDate: '2026-07-07', firstEverServiceDate: '2026-07-07', copayExempt: false,
    storedCopayAmount: 2935, upperLimit: null,
  },
]

const result = buildKokuhorenCsv(
  { facilityNumber: '1310000001', regionCode: '23', unitPrice: 11.2 },
  '202607',
  children,
)

const fail: string[] = []
const pass: string[] = []

if (result.errors.length > 0) {
  fail.push(`想定外のエラー: ${result.errors.join(' / ')}`)
}
if (!result.bytes) {
  console.log('❌ CSVが生成されませんでした'); process.exit(1)
}

// Shift-JISとして復号できるか（文字コード検証）
const text = Encoding.convert(Array.from(result.bytes), { to: 'UNICODE', from: 'SJIS', type: 'string' }) as string
pass.push('Shift-JISとして復号できる')

// 改行コードがCRLFか
const rawLines = text.split('\r\n')
if (text.includes('\n') && !text.includes('\r\n')) fail.push('改行がCRLFでない')
else pass.push('改行コードがCRLF')

const lines = rawLines.filter((l) => l.length > 0)

// コントロールレコード検証
const ctrl = lines[0].split(',')
if (ctrl[0] !== '1') fail.push('先頭がコントロールレコード(1)でない')
else pass.push('コントロールレコードが先頭')
if (ctrl[4] !== 'K11') fail.push(`データ種別が K11 でない: ${ctrl[4]}`)
else pass.push('データ種別 = K11')
if (ctrl[8] !== '1') fail.push(`媒体区分が1(伝送)でない: ${ctrl[8]}`)
else pass.push('媒体区分 = 1（伝送）')
if (ctrl[9] !== '202608') fail.push(`処理対象年月が翌月(202608)でない: ${ctrl[9]}`)
else pass.push('処理対象年月 = 202608（サービス提供月の翌月）')

// エンドレコード検証
const end = lines[lines.length - 1].split(',')
if (end[0] !== '3') fail.push('末尾がエンドレコード(3)でない')
else pass.push('エンドレコードが末尾')

// データレコード件数の一致
const dataLines = lines.slice(1, -1)
if (parseInt(ctrl[3]) !== dataLines.length) {
  fail.push(`レコード件数不一致: 宣言${ctrl[3]} vs 実際${dataLines.length}`)
} else {
  pass.push(`レコード件数が一致（${dataLines.length}件）`)
}

// 連番の通し確認
let seqOk = true
lines.forEach((l, i) => { if (parseInt(l.split(',')[1]) !== i + 1) seqOk = false })
if (!seqOk) fail.push('レコード連番が通番になっていない')
else pass.push('レコード連番が1からの通番')

// 各データレコードの項目数を仕様と照合
const counts: Record<string, number> = {}
for (const line of dataLines) {
  const f = line.split(',')
  if (f[0] !== '2') { fail.push(`データレコードの種別が2でない: ${f[0]}`); continue }
  const body = f.slice(2) // レコード種別・連番を除いた実データ
  const key = `${body[0]}-${body[1]}`
  counts[key] = (counts[key] ?? 0) + 1
  const expected = EXPECTED_FIELDS[key]
  if (expected === undefined) { fail.push(`未知のレコード種別: ${key}`); continue }
  if (body.length !== expected) {
    fail.push(`${key}(${RECORD_LABEL[key]}) の項目数が ${body.length}（仕様は ${expected}）`)
  }
}
for (const key of Object.keys(EXPECTED_FIELDS)) {
  if (counts[key]) pass.push(`${key} ${RECORD_LABEL[key]}: ${counts[key]}件 × ${EXPECTED_FIELDS[key]}項目 一致`)
}

// 金額の整合（請求書合計 = 明細書の合計）
const basic = dataLines.map((l) => l.split(',').slice(2)).filter((f) => f[0] === 'K122' && f[1] === '01')
const invoice = dataLines.map((l) => l.split(',').slice(2)).filter((f) => f[0] === 'K112' && f[1] === '01')
const detailSum = basic.reduce((s, f) => s + parseInt(f[27]), 0) // 請求額 給付費
const invoiceSum = invoice.reduce((s, f) => s + parseInt(f[5]), 0) // 請求金額
if (detailSum !== invoiceSum) fail.push(`請求書の請求金額(${invoiceSum}) と明細書の給付費合計(${detailSum}) が不一致`)
else pass.push(`請求書と明細書の金額が一致（${invoiceSum}円）`)

// サービスコード別内訳が明細情報レコードに1行ずつ出ているか
const taroDetails = dataLines
  .map((l) => l.split(',').slice(2))
  .filter((f) => f[0] === 'K122' && f[1] === '03' && f[5] === '1942330391')
if (taroDetails.length !== 2) {
  fail.push(`内訳2件の児童の明細情報レコードが2行になっていない: ${taroDetails.length}行`)
} else if (taroDetails.reduce((s, f) => s + parseInt(f[9]), 0) !== 7044) {
  fail.push('内訳の明細情報レコードのサービス単位数合計が7044にならない')
} else if (taroDetails[0][6] !== '631111' || taroDetails[1][6] !== '631112') {
  fail.push('内訳のサービスコードが指定どおりに出力されていない')
} else {
  pass.push('サービスコード別内訳が明細情報レコードに1行ずつ出力される')
}

// 市町村ごとに請求書が分かれているか
if (invoice.length !== 2) fail.push(`請求書が市町村数(2)ぶん作られていない: ${invoice.length}`)
else pass.push('請求書が市町村ごとに分割（2市町村）')

const body = (l: string) => l.split(',').slice(2)
const rec = (kind: string, type: string) =>
  dataLines.map(body).filter((f) => f[0] === kind && f[1] === type)
const findBy = (rows: string[][], cert: string, i: number) => rows.find((f) => f[5] === cert)![i]

// 請求書の明細情報はサービス種類ごと。194233 は 61 と 63 の2行、131016 は 63 の1行
const invoiceDetails = rec('K112', '02')
if (invoiceDetails.length !== 3) {
  fail.push(`請求書の明細情報がサービス種類ごとに分かれていない: ${invoiceDetails.length}行（期待値3）`)
} else {
  const kinds = invoiceDetails.map((f) => `${f[3]}/${f[6]}`).sort().join(' ')
  if (kinds !== '131016/63 194233/61 194233/63') {
    fail.push(`請求書 明細情報の市町村×サービス種類の組合せが想定と違う: ${kinds}`)
  } else {
    pass.push('請求書の明細情報がサービス種類ごとに分割（児発61 / 放デイ63）')
  }
  // 児発2人（四郎1282 + 五郎5000）の単位数が1行にまとまっているか
  const hatsu = invoiceDetails.find((f) => f[3] === '194233' && f[6] === '61')!
  if (hatsu[7] !== '2' || hatsu[8] !== '6282') {
    fail.push(`児発の件数・単位数が想定と違う: 件数${hatsu[7]} 単位数${hatsu[8]}（期待値 2 / 6282）`)
  } else {
    pass.push('同一事業所番号の児発・放デイが1枚の請求書にまとまる')
  }
}

// 氏名カナが半角カナ・空白詰めで出力されるか（半角カナは2バイト文字扱いで引用符が付く）
const unquote = (v: string) => v.replace(/^"|"$/g, '')
const taroBasic = rec('K122', '01').find((f) => f[5] === '1942330391')!
if (unquote(taroBasic[7]) !== 'ｹﾝｼｮｳﾀﾛｳ' || unquote(taroBasic[8]) !== 'ｹﾝｼｮｳﾀﾛｳ') {
  fail.push(`氏名カナが半角カナになっていない: ${taroBasic[7]} / ${taroBasic[8]}`)
} else {
  pass.push('保護者カナ・障害児カナが半角カナ（空白詰め）')
}
if (taroBasic[9] !== '23') fail.push(`地域区分が ${taroBasic[9]}（期待値 23 = その他）`)
else pass.push('地域区分 = 23（その他）')

// 開始年月日は当月1日ではなく初回利用日
const days02 = rec('K122', '02')
if (findBy(days02, '1942330391', 7) !== '20220101') {
  fail.push(`開始年月日が初回利用日になっていない: ${findBy(days02, '1942330391', 7)}（期待値 20220101）`)
} else {
  pass.push('開始年月日 = 当事業所の初回利用日（当月1日に丸めない）')
}

// 契約支給量は整数3桁＋小数2桁のゼロ埋め
const contracts = rec('K122', '05')
if (findBy(contracts, '1942330391', 7) !== '02300') {
  fail.push(`契約支給量が ${findBy(contracts, '1942330391', 7)}（期待値 02300）`)
} else {
  pass.push('契約支給量 = 02300（23日の5桁ゼロ埋め）')
}

// 上限額管理: 管理結果1（充当）でも決定利用者負担額は管理結果額をそのまま使う
const jiroBasic = rec('K122', '01').find((f) => f[5] === '1942330393')!
if (jiroBasic[25] !== '0' || jiroBasic[26] !== '0') {
  fail.push(`管理結果1の決定利用者負担額が0でない: 管理後${jiroBasic[25]} / 決定${jiroBasic[26]}`)
} else {
  pass.push('上限額管理 結果1 → 上限額管理後・決定利用者負担額ともに管理結果額(0円)')
}
if (jiroBasic[21] !== '4600') {
  fail.push(`管理ありでも上限月額調整は min(上限,1割) のはず: ${jiroBasic[21]}`)
} else {
  pass.push('上限額管理があっても上限月額調整は min(負担上限月額, 1割相当額)')
}

// 無償化対象は上限月額調整・決定利用者負担額ともに0
const goroBasic = rec('K122', '01').find((f) => f[5] === '1942330395')!
if (goroBasic[21] !== '0' || goroBasic[26] !== '0') {
  fail.push(`無償化対象の上限月額調整/決定利用者負担額が0でない: ${goroBasic[21]} / ${goroBasic[26]}`)
} else {
  pass.push('無償化対象は上限月額調整・決定利用者負担額ともに0（負担上限月額は4,600円のまま）')
}
if (goroBasic[11] !== '4600') {
  fail.push(`無償化対象の利用者負担上限月額①が ${goroBasic[11]}（期待値 4600）`)
} else {
  pass.push('無償化対象でも利用者負担上限月額①は受給者証どおり')
}

// 算定しない金額欄は空欄ではなく0（取込成功済みの実データに合わせる）
const zeroSpots: Array<[string, string, number[]]> = [
  ['K112', '01', [12, 13, 14, 15, 20, 22]],
  ['K112', '02', [11, 13]],
  ['K122', '01', [28, 29, 31, 32, 33, 34]],
  ['K122', '04', [22, 25, 26, 27, 28]],
]
const zeroMiss: string[] = []
for (const [kind, type, idxs] of zeroSpots) {
  for (const f of rec(kind, type)) {
    for (const i of idxs) if (f[i] !== '0') zeroMiss.push(`${kind}-${type} 項目${i + 1}=${f[i] || '(空)'}`)
  }
}
if (zeroMiss.length > 0) fail.push(`0を送るべき欄が空欄: ${[...new Set(zeroMiss)].join(', ')}`)
else pass.push('算定しない金額欄は 0（空欄ではない）')

console.log('=== 検証結果 ===')
pass.forEach((p) => console.log('  ✓', p))
if (result.warnings.length > 0) {
  console.log('--- 警告 ---')
  result.warnings.forEach((w) => console.log('  ⚠', w))
}
if (fail.length > 0) {
  console.log('--- 失敗 ---')
  fail.forEach((f) => console.log('  ✗', f))
} else {
  console.log('\n✅ すべての検証項目に合格')
}

const outPath = process.argv[2]
if (outPath) {
  writeFileSync(outPath, Buffer.from(result.bytes))
  console.log(`\n出力ファイル: ${outPath}（${result.fileName} / ${result.bytes.length} bytes / Shift-JIS）`)
}

console.log('\n=== 生成内容（参考・UTF-8で表示） ===')
console.log(text)

process.exit(fail.length > 0 ? 1 : 0)
