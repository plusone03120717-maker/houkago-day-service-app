// 「利用者負担額一覧表」の印刷レイアウト（A4縦・提供先の上限額管理事業所ごと、1枚10名まで）。
// 上限額管理事業所へ、当事業所分の総費用額・利用者負担額・利用回数・欠席回数を伝える。

import type { CopayListChild } from '@/lib/kokuhoren/copay-list'

export const COPAY_LIST_ROWS = 10

export type CopayListDocumentData = {
  yearMonth: string
  managerName: string
  managerNumber: string
  children: CopayListChild[]
  facility: { name: string; facilityNumber: string; address: string; phone: string }
}

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '2px 6px',
  verticalAlign: 'middle',
  height: '22px',
}
const label: React.CSSProperties = { ...cell, textAlign: 'center', fontSize: '8.5pt' }
const num: React.CSSProperties = { ...cell, textAlign: 'right' }

export function CopayListDocument({ data }: { data: CopayListDocumentData }) {
  const reiwaYear = parseInt(data.yearMonth.slice(0, 4)) - 2018
  const month = parseInt(data.yearMonth.slice(4, 6))
  const yen = (n: number) => n.toLocaleString('ja-JP')

  const rows: Array<CopayListChild | null> = [...data.children]
  while (rows.length < COPAY_LIST_ROWS) rows.push(null)

  return (
    <div
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '9.5pt',
        color: '#000',
        padding: '4px',
      }}
    >
      <h2 style={{ textAlign: 'center', fontSize: '15pt', fontWeight: 700, margin: '4px 0 10px' }}>
        利用者負担額一覧表
      </h2>
      <div style={{ textAlign: 'right' }}>令和　　　年　　　月　　　日</div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '14px' }}>（　提　供　先　）</div>
          <div
            style={{
              fontSize: '12pt',
              borderBottom: '1px solid #000',
              padding: '2px 4px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{data.managerName}</span>
            <span>殿</span>
          </div>
          {data.managerNumber && (
            <div style={{ fontSize: '8.5pt', marginTop: '3px' }}>指定事業所番号 {data.managerNumber}</div>
          )}
          <div style={{ marginTop: '14px' }}>下記のとおり提供します。</div>
        </div>

        <table style={{ borderCollapse: 'collapse', width: '55%' }}>
          <tbody>
            <tr>
              <td rowSpan={4} style={{ ...label, width: '18px', writingMode: 'vertical-rl' }}>
                事業者
              </td>
              <td style={{ ...label, width: '90px' }}>指定事業所番号</td>
              <td style={cell}>{data.facility.facilityNumber}</td>
            </tr>
            <tr>
              <td style={label}>
                住　所
                <br />
                （所在地）
              </td>
              <td style={{ ...cell, height: '40px', fontSize: '8.5pt' }}>{data.facility.address}</td>
            </tr>
            <tr>
              <td style={label}>電話番号</td>
              <td style={cell}>{data.facility.phone}</td>
            </tr>
            <tr>
              <td style={label}>名　称</td>
              <td style={cell}>{data.facility.name}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', fontSize: '11pt' }}>
        令和 {reiwaYear} 年 {month} 月分
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
        <tbody>
          {rows.map((c, i) => (
            <RowGroup key={i} no={i + 1} c={c} yen={yen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RowGroup({ no, c, yen }: { no: number; c: CopayListChild | null; yen: (n: number) => string }) {
  return (
    <>
      <tr>
        <td rowSpan={3} style={{ ...label, width: '30px' }}>
          {no}
        </td>
        <td rowSpan={3} style={{ ...label, width: '22px', writingMode: 'vertical-rl', fontSize: '7pt' }}>
          支給決定障害者等欄
        </td>
        <td style={{ ...label, width: '84px' }}>市町村番号</td>
        <td style={{ ...cell, width: '96px', textAlign: 'center' }}>{c?.municipalityCode ?? ''}</td>
        <td style={{ ...label, width: '86px' }}>総費用額</td>
        <td style={num}>{c ? yen(c.totalCost) : ''}</td>
        <td colSpan={2} style={label}>
          利用状況
        </td>
      </tr>
      <tr>
        <td style={label}>受給者証番号</td>
        <td style={{ ...cell, textAlign: 'center', letterSpacing: '1px' }}>{c?.certificateNumber ?? ''}</td>
        <td style={label}>利用者負担額</td>
        <td style={num}>{c ? yen(c.copayAmount) : ''}</td>
        <td style={{ ...label, width: '62px' }}>利用回数</td>
        <td style={{ ...num, width: '46px' }}>{c ? c.usedDays : ''}</td>
      </tr>
      <tr>
        <td style={label}>氏　　名</td>
        <td colSpan={3} style={{ ...cell, textAlign: 'center' }}>
          {c?.childName ?? ''}
        </td>
        <td style={label}>欠席回数</td>
        <td style={num}>{c ? c.absentDays : ''}</td>
      </tr>
    </>
  )
}
