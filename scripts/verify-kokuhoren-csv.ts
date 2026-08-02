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

// 擬似データ: 4パターンを網羅
const children: ChildBillingInput[] = [
  {
    // 通常ケース（負担上限4,600円・継続契約）
    childName: '検証 太郎', certificateNumber: '1942330391', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 12, totalUnits: 7044, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 23, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 1, firstServiceDate: '2026-07-02',
    storedCopayAmount: 4600, upperLimit: null,
  },
  {
    // 負担上限0円（生活保護・非課税世帯）
    childName: '検証 花子', certificateNumber: '1942330392', municipalityCode: '194233',
    copayLimit: 0, totalDays: 8, totalUnits: 4696, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 15, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 1, firstServiceDate: '2026-07-03',
    storedCopayAmount: 0, upperLimit: null,
  },
  {
    // 上限額管理あり（管理結果3: 調整済み）
    childName: '検証 次郎', certificateNumber: '1942330393', municipalityCode: '194233',
    copayLimit: 4600, totalDays: 10, totalUnits: 5870, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 20, contractStartDate: '2026-04-01',
    contractEndDate: null, contractLineNumber: 2, firstServiceDate: '2026-07-01',
    storedCopayAmount: 3000,
    upperLimit: { officeNumber: '1310000099', result: '3', resultAmount: 3000 },
  },
  {
    // 別市町村 + 月途中契約開始（請求書が市町村ごとに分かれることの検証）
    childName: '検証 三郎', certificateNumber: '1310160001', municipalityCode: '131016',
    copayLimit: 37200, totalDays: 5, totalUnits: 2935, serviceCode: '631111',
    decisionServiceCode: '631000', contractDays: 23, contractStartDate: '2026-07-06',
    contractEndDate: null, contractLineNumber: 1, firstServiceDate: '2026-07-07',
    storedCopayAmount: 2935, upperLimit: null,
  },
]

const result = buildKokuhorenCsv(
  { facilityNumber: '1310000001', regionCode: '01', unitPrice: 11.2 },
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

// 市町村ごとに請求書が分かれているか
if (invoice.length !== 2) fail.push(`請求書が市町村数(2)ぶん作られていない: ${invoice.length}`)
else pass.push('請求書が市町村ごとに分割（2市町村）')

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
