import {
  buildServiceRecordCsv,
  BASIC_FIELD_COUNT,
  DETAIL_FIELD_COUNT,
  type ServiceRecordChild,
} from '../src/lib/kokuhoren/service-record'
import Encoding from 'encoding-japanese'
import { writeFileSync } from 'node:fs'

// 擬似データ: 通常日・休業日・欠席・延長・送迎ありなしを網羅
const children: ServiceRecordChild[] = [
  {
    childName: '検証 太郎',
    certificateNumber: '1942330391',
    municipalityCode: '194233',
    days: [
      // 平日・4時間（延長1時間）・送迎往復あり
      {
        date: '2026-07-02', serviceFormType: 1, startTime: '13:00', endTime: '17:00',
        hours: 4, transportPickup: true, transportDropoff: true, absent: false, extensionLevel: 2,
      },
      // 休業日・6時間（延長1時間）・送迎往のみ
      {
        date: '2026-07-04', serviceFormType: 2, startTime: '10:00', endTime: '16:00',
        hours: 6, transportPickup: true, transportDropoff: false, absent: false, extensionLevel: 2,
      },
      // 平日・2時間・延長なし・送迎なし
      {
        date: '2026-07-07', serviceFormType: 1, startTime: '15:00', endTime: '17:00',
        hours: 2, transportPickup: false, transportDropoff: false, absent: false, extensionLevel: 0,
      },
      // 欠席（欠席時対応加算）
      {
        date: '2026-07-09', serviceFormType: 1, startTime: null, endTime: null,
        hours: 0, transportPickup: false, transportDropoff: false, absent: true, extensionLevel: 0,
      },
      // 平日・2.5時間（30分単位）
      {
        date: '2026-07-14', serviceFormType: 1, startTime: '14:00', endTime: '16:30',
        hours: 2.5, transportPickup: false, transportDropoff: true, absent: false, extensionLevel: 0,
      },
    ],
  },
  {
    childName: '検証 花子',
    certificateNumber: '1310160001',
    municipalityCode: '131016',
    days: [
      {
        date: '2026-07-03', serviceFormType: 1, startTime: '13:30', endTime: '17:30',
        hours: 4, transportPickup: true, transportDropoff: true, absent: false, extensionLevel: 2,
      },
    ],
  },
]

const result = buildServiceRecordCsv(
  { facilityNumber: '1310000001', formTypeCode: '0501' },
  '202607',
  children,
)

const fail: string[] = []
const pass: string[] = []

if (result.errors.length > 0) fail.push(`想定外のエラー: ${result.errors.join(' / ')}`)
if (!result.bytes) { console.log('❌ CSVが生成されませんでした'); process.exit(1) }

const text = Encoding.convert(Array.from(result.bytes), { to: 'UNICODE', from: 'SJIS', type: 'string' }) as string
pass.push('Shift-JISとして復号できる')

if (text.includes('\n') && !text.includes('\r\n')) fail.push('改行がCRLFでない')
else pass.push('改行コードがCRLF')

const lines = text.split('\r\n').filter((l) => l.length > 0)

// コントロールレコード
const ctrl = lines[0].split(',')
if (ctrl[0] !== '1') fail.push('先頭がコントロールレコード(1)でない')
else pass.push('コントロールレコードが先頭')
if (ctrl[4] !== 'K61') fail.push(`データ種別が K61 でない: ${ctrl[4]}`)
else pass.push('データ種別 = K61（交換情報識別番号 K611 の上3桁）')
if (ctrl[9] !== '202608') fail.push(`処理対象年月が翌月(202608)でない: ${ctrl[9]}`)
else pass.push('処理対象年月 = 202608（サービス提供月の翌月）')

// エンドレコード
if (lines[lines.length - 1].split(',')[0] !== '3') fail.push('末尾がエンドレコード(3)でない')
else pass.push('エンドレコードが末尾')

const dataLines = lines.slice(1, -1)
if (parseInt(ctrl[3]) !== dataLines.length) {
  fail.push(`レコード件数不一致: 宣言${ctrl[3]} vs 実際${dataLines.length}`)
} else {
  pass.push(`レコード件数が一致（${dataLines.length}件）`)
}

let seqOk = true
lines.forEach((l, i) => { if (parseInt(l.split(',')[1]) !== i + 1) seqOk = false })
if (!seqOk) fail.push('レコード連番が通番になっていない')
else pass.push('レコード連番が1からの通番')

// 項目数の照合
const bodies = dataLines.map((l) => l.split(',').slice(2))
const basics = bodies.filter((f) => f[1] === '01')
const details = bodies.filter((f) => f[1] === '02')

for (const b of basics) {
  if (b.length !== BASIC_FIELD_COUNT) fail.push(`基本情報レコードの項目数が ${b.length}（仕様は ${BASIC_FIELD_COUNT}）`)
}
for (const d of details) {
  if (d.length !== DETAIL_FIELD_COUNT) fail.push(`明細情報レコードの項目数が ${d.length}（仕様は ${DETAIL_FIELD_COUNT}）`)
}
if (!fail.some((f) => f.includes('項目数'))) {
  pass.push(`基本情報レコード: ${basics.length}件 × ${BASIC_FIELD_COUNT}項目 一致`)
  pass.push(`明細情報レコード: ${details.length}件 × ${DETAIL_FIELD_COUNT}項目 一致`)
}

if (basics.length !== 2) fail.push(`基本情報レコードが児童数(2)ぶん作られていない: ${basics.length}`)
else pass.push('基本情報レコードが児童ごとに1件')
if (details.length !== 6) fail.push(`明細情報レコードが実績日数(6)ぶん作られていない: ${details.length}`)
else pass.push('明細情報レコードが実績日ごとに1件')

// 交換情報識別番号・様式種別番号
if (bodies.some((f) => f[0] !== 'K611')) fail.push('交換情報識別番号が K611 でないレコードがある')
else pass.push('全レコードの交換情報識別番号 = K611')
if (bodies.some((f) => f[6] !== '0501')) fail.push('様式種別番号が 0501（放課後等デイサービス）でないレコードがある')
else pass.push('様式種別番号 = 0501（放課後等デイサービス）')

// 基本情報: 合計算定時間数計 = 各日の算定時間数の合計
const taro = basics.find((f) => f[5] === '1942330391')!
const taroHoursSum = 4 + 6 + 2 + 0 + 2.5 // = 14.5時間 → 1450
if (taro[18] !== String(taroHoursSum * 100)) {
  fail.push(`合計 算定時間数計が ${taro[18]}（期待値 ${taroHoursSum * 100}）`)
} else {
  pass.push(`合計 算定時間数計 = ${taro[18]}（${taroHoursSum}時間の整数部3桁＋小数部2桁表現）`)
}
// 送迎加算（回）は片道単位: 往2 + 復2 = 4
if (taro[33] !== '4') fail.push(`実績 送迎加算（回）が ${taro[33]}（期待値 4・片道単位）`)
else pass.push('実績 送迎加算（回）= 4（片道単位の合計）')
// 延長支援加算（回）: 2日
if (taro[169] !== '2') fail.push(`延長支援加算（回）が ${taro[169]}（期待値 2）`)
else pass.push('延長支援加算（回）= 2')

// 明細情報: 提供形態・欠席・時刻・延長区分
const taroDetails = details.filter((f) => f[5] === '1942330391')
const d0702 = taroDetails.find((f) => f[8] === '2')!
if (d0702[13] !== '1300' || d0702[14] !== '1700') fail.push('開始/終了時間が HHMM 形式で出力されていない')
else pass.push('開始・終了時間が HHMM 形式（1300 / 1700）')
if (d0702[15] !== '400') fail.push(`算定時間数が ${d0702[15]}（期待値 400 = 4.00時間）`)
else pass.push('算定時間数 = 400（整数部2桁＋小数部2桁表現）')
if (d0702[33] !== '1') fail.push(`平日の提供形態が ${d0702[33]}（期待値 1）`)
else pass.push('提供形態 = 1（授業の終了後）')
if (d0702[110] !== '2') fail.push(`延長支援加算の区分が ${d0702[110]}（期待値 2）`)
else pass.push('延長支援加算 = 2（1時間以上2時間未満）')
if (d0702[20] !== '1' || d0702[21] !== '1') fail.push('送迎加算 往/復 が設定されていない')
else pass.push('送迎加算 往 = 1 / 復 = 1')

const d0704 = taroDetails.find((f) => f[8] === '4')!
if (d0704[33] !== '2') fail.push(`休業日の提供形態が ${d0704[33]}（期待値 2）`)
else pass.push('休業日の提供形態 = 2')
if (d0704[21] !== '') fail.push('送迎（復）がない日に復が設定されている')
else pass.push('送迎がない日は空欄')

const d0709 = taroDetails.find((f) => f[8] === '9')!
if (d0709[35] !== '8') fail.push(`欠席日のサービス提供の状況が ${d0709[35]}（期待値 8）`)
else pass.push('欠席日のサービス提供の状況 = 8（欠席時対応加算）')
if (d0709[13] !== '' || d0709[14] !== '' || d0709[15] !== '' || d0709[33] !== '') {
  fail.push('欠席日に時刻・算定時間数・提供形態が設定されている')
} else {
  pass.push('欠席日は時刻・算定時間数・提供形態が空欄')
}

const d0714 = taroDetails.find((f) => f[8] === '14')!
if (d0714[15] !== '250') fail.push(`2.5時間の算定時間数が ${d0714[15]}（期待値 250）`)
else pass.push('2.5時間 → 250（30分単位の小数表現）')

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
