// 上限額管理結果票CSV（K411）の検証。
// 前システムが国保連の取込に成功した令和8年7月分の実ファイルと、
// 同じ入力から同じ内容が出るかを1行ずつ突き合わせる。

import { buildUpperLimitCsv, type UpperLimitChild } from '../src/lib/kokuhoren/upper-limit'
import Encoding from 'encoding-japanese'
import { writeFileSync } from 'node:fs'

// 実ファイル（上限管理結果票_202607.csv）の中身
const EXPECTED = [
  '1,1,0,3,K41,0,1951200672,0,1,202608,',
  '2,2,K411,01,202607,1,194308,1951200672,1943006005,"ｸﾜﾊﾞﾗｱｽｷ","ｸﾜﾊﾞﾗｱｽｷ",4600,1,280110,9200,4600',
  '2,3,K411,02,202607,194308,1951200672,1943006005,1,1951200672,198550,4600,4600',
  '2,4,K411,02,202607,194308,1951200672,1943006005,2,1951200649,81560,4600,0',
  '3,5',
]

const children: UpperLimitChild[] = [
  {
    childName: '桑原 明日輝',
    childNameKana: 'クワバラアスキ',
    certificateNumber: '1943006005',
    municipalityCode: '194308',
    copayLimit: 4600,
    result: '1',
    offices: [
      {
        lineNo: 1, officeNumber: '1951200672', officeName: 'ぷらすわん',
        totalCost: 198550, copayAmount: 4600, managedCopayAmount: 4600,
      },
      {
        lineNo: 2, officeNumber: '1951200649', officeName: 'ココロン',
        totalCost: 81560, copayAmount: 4600, managedCopayAmount: 0,
      },
    ],
  },
]

const result = buildUpperLimitCsv({ facilityNumber: '1951200672' }, '202607', children)

const fail: string[] = []
const pass: string[] = []

if (result.errors.length > 0) fail.push(`想定外のエラー: ${result.errors.join(' / ')}`)
if (!result.bytes) { console.log('❌ CSVが生成されませんでした'); process.exit(1) }

const text = Encoding.convert(Array.from(result.bytes), { to: 'UNICODE', from: 'SJIS', type: 'string' }) as string
pass.push('Shift-JISとして復号できる')

if (text.includes('\n') && !text.includes('\r\n')) fail.push('改行がCRLFでない')
else pass.push('改行コードがCRLF')

const lines = text.split('\r\n').filter((l) => l.length > 0)

if (lines.length !== EXPECTED.length) {
  fail.push(`行数が違います: ${lines.length}行（実ファイルは ${EXPECTED.length}行）`)
} else {
  pass.push(`行数が実ファイルと一致（${lines.length}行）`)
}

lines.forEach((line, i) => {
  const expected = EXPECTED[i]
  if (expected === undefined) return
  if (line !== expected) {
    fail.push(`${i + 1}行目が実ファイルと違います\n      出力: ${line}\n      実物: ${expected}`)
  }
})
if (!fail.some((f) => f.includes('行目'))) {
  pass.push('全行が実ファイルと完全一致（コントロール・基本情報・明細情報・エンド）')
}

if (result.fileName !== 'K4112607.CSV') {
  fail.push(`ファイル名が ${result.fileName}（期待値 K4112607.CSV）`)
} else {
  pass.push('ファイル名 = K4112607.CSV')
}

// 管理結果3で合計が上限月額と合わない場合に警告が出るか
const warnCase = buildUpperLimitCsv({ facilityNumber: '1951200672' }, '202607', [
  {
    ...children[0],
    result: '3',
    offices: [{ ...children[0].offices[0], managedCopayAmount: 1000 }],
  },
])
if (!warnCase.warnings.some((w) => w.includes('負担上限月額'))) {
  fail.push('管理結果3で合計が上限月額と一致しないのに警告が出ない')
} else {
  pass.push('管理結果3で調整後の合計が負担上限月額と合わないと警告が出る')
}

// 当事業所の行がない内訳では警告が出るか
const noSelf = buildUpperLimitCsv({ facilityNumber: '1951200672' }, '202607', [
  { ...children[0], offices: [children[0].offices[1]] },
])
if (!noSelf.warnings.some((w) => w.includes('当事業所'))) {
  fail.push('内訳に当事業所の行がないのに警告が出ない')
} else {
  pass.push('内訳に当事業所の行がないと警告が出る')
}

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
