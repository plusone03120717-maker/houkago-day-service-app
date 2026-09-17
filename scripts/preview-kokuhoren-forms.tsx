// 国保連の帳票（様式第一・様式第二・様式5）のレイアウトを、DBやログインなしで
// HTMLに書き出して目視確認するためのスクリプト。
//
//   npx tsx scripts/preview-kokuhoren-forms.tsx out.html
//
// 印刷レイアウトの調整は実データがなくても確認できるようにしておきたいので、
// 擬似データを直接渡して renderToStaticMarkup する。

import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import {
  KokuhorenInvoiceDocument,
  type KokuhorenInvoiceData,
} from '../src/components/documents/kokuhoren-invoice-document'
import {
  KokuhorenDetailDocument,
  type KokuhorenDetailData,
} from '../src/components/documents/kokuhoren-detail-document'
import {
  ServiceRecordDocument,
  type ServiceRecordDocumentData,
} from '../src/components/documents/service-record-document'
import {
  UpperLimitDocument,
  type UpperLimitDocumentData,
} from '../src/components/documents/upper-limit-document'
import type { ChildComputed } from '../src/lib/kokuhoren/build'

const facility = {
  name: 'ぷらすわん',
  facilityNumber: '1951200672',
  postalCode: '4030013',
  address: '山梨県 富士吉田市 緑ケ丘2丁目6-12-101',
  phone: '080-3938-0425',
}

const invoice: KokuhorenInvoiceData = {
  yearMonth: '202607',
  municipalityCode: '192021',
  claimDate: '2026-08-01',
  facility,
  lines: [
    { kind: '61', count: 1, units: 6905, totalCost: 69050, benefitAmount: 69050, copayAmount: 0 },
    { kind: '63', count: 15, units: 126446, totalCost: 1264460, benefitAmount: 1232196, copayAmount: 32264 },
  ],
}

const child: ChildComputed = {
  childName: '三枝 曜',
  childNameKana: 'サエグサ ヨウ',
  certificateNumber: '1920209309',
  municipalityCode: '192021',
  copayLimit: 0,
  totalDays: 6,
  totalUnits: 6905,
  serviceCode: '614044',
  breakdown: [
    { code: '614044', name: '児発児童指導員等加配加算２２１１', unitCount: 152, count: 4, units: 608 },
    { code: '614558', name: '児発専門的な支援体制加算２１１', unitCount: 123, count: 4, units: 492 },
    { code: '615495', name: '児発欠席時対応加算', unitCount: 94, count: 2, units: 188 },
    { code: '615640', name: '児発処遇改善加算Ⅱロ', unitCount: 927, count: 1, units: 927 },
    { code: '615702', name: '児発専門的支援実施加算', unitCount: 150, count: 4, units: 600 },
    { code: '616240', name: '児発送迎加算１', unitCount: 54, count: 7, units: 378 },
    { code: '61JH16', name: '児発２１４１２', unitCount: 928, count: 4, units: 3712 },
  ],
  decisionServiceCode: '611000',
  contractDays: 10,
  contractStartDate: '2026-05-01',
  contractEndDate: null,
  contractLineNumber: 1,
  serviceStartDate: '2026-05-01',
  firstEverServiceDate: '2026-05-01',
  copayExempt: false,
  storedCopayAmount: 0,
  upperLimit: null,
  totalCost: 69050,
  tenPercent: 6905,
  capAdjusted: 0,
  managedCopay: null,
  decidedCopay: 0,
  benefitAmount: 69050,
  startDate: '2026-05-01',
}

const detail: KokuhorenDetailData = {
  yearMonth: '202607',
  child,
  facility: { name: facility.name, facilityNumber: facility.facilityNumber, regionLabel: 'その他' },
  upperLimitFacilityName: null,
  pageNo: 1,
  pageCount: 37,
}

const record: ServiceRecordDocumentData = {
  yearMonth: '202607',
  serviceType: 'afterschool',
  childName: '渡邊 翔太',
  certificateNumber: '1920209812',
  contractDays: 10,
  facility,
  days: [
    {
      date: '2026-07-06', serviceFormType: 1, startTime: '14:40', endTime: '16:30', hours: 2,
      transportPickup: false, transportDropoff: false, absent: false, extensionLevel: 0,
      specializedSupport: true,
    },
    {
      date: '2026-07-13', serviceFormType: 1, startTime: '14:40', endTime: '16:30', hours: 2,
      transportPickup: true, transportDropoff: true, absent: false, extensionLevel: 0,
      specializedSupport: true,
    },
    {
      date: '2026-07-20', serviceFormType: 2, startTime: '10:00', endTime: '16:00', hours: 5,
      transportPickup: true, transportDropoff: true, absent: false, extensionLevel: 2,
      specializedSupport: false,
    },
    {
      date: '2026-07-27', serviceFormType: 2, startTime: '10:00', endTime: '16:00', hours: 5,
      transportPickup: true, transportDropoff: true, absent: false, extensionLevel: 2,
      specializedSupport: false,
    },
  ],
  pageNo: 1,
  pageCount: 37,
}

// 実データ（HKD075008.pdf）と同じ内容で上限額管理結果票を確認する
const upperLimit: UpperLimitDocumentData = {
  yearMonth: '202607',
  facility,
  child: {
    childName: '桑原 明日輝',
    childNameKana: 'クワバラ アスキ',
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
}

const pages = [
  renderToStaticMarkup(<KokuhorenInvoiceDocument data={invoice} />),
  renderToStaticMarkup(<KokuhorenDetailDocument data={detail} />),
  renderToStaticMarkup(<ServiceRecordDocument data={record} />),
  renderToStaticMarkup(<UpperLimitDocument data={upperLimit} />),
]

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>国保連帳票プレビュー</title>
<style>
  body { margin: 0; background: #e5e5e5; font-family: 'Hiragino Sans','Yu Gothic',sans-serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; padding: 8mm; background: #fff; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 8mm; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; page-break-after: always; } }
</style></head><body>
${pages.map((p) => `<div class="sheet">${p}</div>`).join('\n')}
</body></html>`

const out = process.argv[2] ?? 'kokuhoren-forms-preview.html'
writeFileSync(out, html, 'utf-8')
console.log(`出力: ${out}（${pages.length}枚）`)
