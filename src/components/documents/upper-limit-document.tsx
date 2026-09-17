// 「利用者負担上限額管理結果票」の印刷レイアウト（A4縦・児童ごとに1枚）。
// 印刷したものをJFAXで関係事業所へ送るため、様式どおりの体裁にしている。

import type { UpperLimitChild } from '@/lib/kokuhoren/upper-limit'

export type UpperLimitDocumentData = {
  yearMonth: string
  child: UpperLimitChild
  facility: { name: string; facilityNumber: string }
}

const RESULT_TEXT: Array<[string, string]> = [
  ['1', '管理事業所で利用者負担額を充当したため、他事業所の利用者負担は発生しない。'],
  ['2', '利用者負担額の合算額が、負担上限月額以下のため、調整事務は行わない。'],
  ['3', '利用者負担額の合算額が、負担上限月額を超過するため、下記のとおり調整した。'],
]

/**
 * 集計欄は2段。上段が事業所5枠、下段が事業所4枠＋合計欄。
 * 実データ（取込成功済み）でも合計は下段の右端に入っていた。
 */
const UPPER_SLOTS = 5
const LOWER_SLOTS = 4

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 5px',
  verticalAlign: 'middle',
  height: '22px',
}
const label: React.CSSProperties = { ...cell, textAlign: 'center', fontSize: '8.5pt' }
const numCell: React.CSSProperties = { ...cell, textAlign: 'right' }

type Office = UpperLimitChild['offices'][number]

function Block({
  offices,
  slots,
  totals,
}: {
  offices: Office[]
  slots: number
  /** 指定すると右端に合計欄を出す */
  totals: { totalCost: number; copayAmount: number; managedCopayAmount: number } | null
}) {
  const filled: Array<Office | null> = [...offices]
  while (filled.length < slots) filled.push(null)
  const yen = (n: number) => n.toLocaleString('ja-JP')

  const row = (
    rowLabel: string,
    render: (o: Office | null) => string,
    totalValue: string | null,
    extra?: React.CSSProperties,
  ) => (
    <tr>
      <td style={{ ...label, width: '150px', ...extra }}>{rowLabel}</td>
      {filled.map((o, i) => (
        <td key={i} style={totalValue === null ? { ...cell, textAlign: 'center' } : numCell}>
          {render(o)}
        </td>
      ))}
      {totals && <td style={totalValue === null ? { ...cell } : numCell}>{totalValue ?? ''}</td>}
    </tr>
  )

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '8px' }}>
      <tbody>
        <tr>
          <td rowSpan={6} style={{ ...label, width: '16px', writingMode: 'vertical-rl', fontSize: '7.5pt' }}>
            利用者負担額集計・調整欄
          </td>
          <td style={{ ...label, width: '150px' }}>項番</td>
          {filled.map((o, i) => (
            <td key={i} style={{ ...cell, textAlign: 'center' }}>{o?.lineNo ?? ''}</td>
          ))}
          {totals && <td rowSpan={3} style={{ ...label, width: '16%' }}>合　計</td>}
        </tr>
        <tr>
          <td style={label}>事業所番号</td>
          {filled.map((o, i) => (
            <td key={i} style={{ ...cell, textAlign: 'center', fontSize: '8pt' }}>{o?.officeNumber ?? ''}</td>
          ))}
        </tr>
        <tr>
          <td style={label}>事業所名称</td>
          {filled.map((o, i) => (
            <td key={i} style={{ ...cell, height: '46px', textAlign: 'center', fontSize: '8pt' }}>
              {o?.officeName ?? ''}
            </td>
          ))}
        </tr>
        {row('総費用額', (o) => (o ? yen(o.totalCost) : ''), totals ? yen(totals.totalCost) : '')}
        {row('利用者負担額', (o) => (o ? yen(o.copayAmount) : ''), totals ? yen(totals.copayAmount) : '')}
        {row(
          '管理結果後利用者負担額',
          (o) => (o ? yen(o.managedCopayAmount) : ''),
          totals ? yen(totals.managedCopayAmount) : '',
          { fontSize: '7.5pt' },
        )}
      </tbody>
    </table>
  )
}

export function UpperLimitDocument({ data }: { data: UpperLimitDocumentData }) {
  const c = data.child
  const reiwaYear = parseInt(data.yearMonth.slice(0, 4)) - 2018
  const month = data.yearMonth.slice(4, 6)
  const yen = (n: number) => n.toLocaleString('ja-JP')

  const totals = {
    totalCost: c.offices.reduce((s, o) => s + o.totalCost, 0),
    copayAmount: c.offices.reduce((s, o) => s + o.copayAmount, 0),
    managedCopayAmount: c.offices.reduce((s, o) => s + o.managedCopayAmount, 0),
  }

  const first = c.offices.slice(0, UPPER_SLOTS)
  const rest = c.offices.slice(UPPER_SLOTS, UPPER_SLOTS + LOWER_SLOTS)

  return (
    <div
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '9.5pt',
        color: '#000',
      }}
    >
      <div style={{ border: '1px solid #000', padding: '14px 16px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 700, margin: '4px 0 12px' }}>
          利用者負担上限額管理結果票
        </h2>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...label, padding: '3px 12px' }}>令和</td>
                <td style={{ ...cell, width: '34px', textAlign: 'center' }}>{reiwaYear}</td>
                <td style={label}>年</td>
                <td style={{ ...cell, width: '34px', textAlign: 'center' }}>{month}</td>
                <td style={label}>月分</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse', flex: 1 }}>
            <tbody>
              <tr>
                <td style={{ ...label, width: '130px' }}>都道府県等番号</td>
                <td style={cell}>{c.municipalityCode}</td>
              </tr>
              <tr>
                <td style={label}>受 給 者 証 番 号</td>
                <td style={cell}>{c.certificateNumber}</td>
              </tr>
              <tr>
                <td style={label}>
                  支給決定障害者等
                  <br />
                  氏　　　　　　名
                </td>
                <td style={{ ...cell, height: '34px', textAlign: 'center' }}>{c.childName}</td>
              </tr>
              <tr>
                <td style={label}>
                  支給決定に係る
                  <br />
                  障 害 児 氏 名
                </td>
                <td style={{ ...cell, height: '34px', textAlign: 'center' }}>{c.childName}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ borderCollapse: 'collapse', width: '48%' }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ ...label, width: '16px', writingMode: 'vertical-rl' }}>
                  管理事業者
                </td>
                <td style={{ ...label, width: '110px' }}>指定事業所番号</td>
                <td style={cell}>{data.facility.facilityNumber}</td>
              </tr>
              <tr>
                <td style={label}>
                  事業所及び
                  <br />
                  その事業所
                  <br />
                  の 名 称
                </td>
                <td style={{ ...cell, height: '62px', textAlign: 'center' }}>{data.facility.name}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <table style={{ borderCollapse: 'collapse', marginTop: '10px' }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '170px' }}>利用者負担上限月額</td>
              <td style={{ ...numCell, width: '110px' }}>{yen(c.copayLimit)}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ borderCollapse: 'collapse', marginTop: '8px', width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '210px' }}>利用者負担上限額管理結果</td>
              <td style={{ ...cell, width: '60px', textAlign: 'center' }}>{c.result}</td>
              <td style={{ border: 'none' }} />
            </tr>
          </tbody>
        </table>

        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '4px' }}>
          <tbody>
            {RESULT_TEXT.map(([no, text]) => (
              <tr key={no}>
                <td style={{ border: 'none', padding: '3px 6px 3px 28px', width: '28px' }}>{no}</td>
                <td style={{ border: 'none', padding: '3px 6px' }}>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ borderTop: '1px solid #000', marginTop: '-1px' }} />

        <Block offices={first} slots={UPPER_SLOTS} totals={null} />
        <Block offices={rest} slots={LOWER_SLOTS} totals={totals} />

        <div style={{ textAlign: 'center', marginTop: '18px' }}>上記内容について確認しました。</div>
        <div style={{ textAlign: 'center', marginTop: '6px' }}>令和　　　年　　　月　　　日</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', padding: '0 40px' }}>
          <span>支給決定障害者等氏名</span>
          <span>印</span>
        </div>
      </div>
    </div>
  )
}
