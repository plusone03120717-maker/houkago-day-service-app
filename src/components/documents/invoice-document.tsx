// 請求書・領収書の印刷レイアウト（A4縦・1枚1名1か月）。
// 個別支援計画書と同じく、ブラウザの印刷ダイアログからPDF保存できる。

import { Fragment } from 'react'
import type { InvoiceLine } from '@/lib/billing/copay-invoice'

export type InvoiceDocumentData = {
  childName: string
  certificateNumber: string | null
  yearMonth: string
  lines: InvoiceLine[]
  total: number
  /** 総費用額（10割）。内訳の説明に使う */
  totalCost: number
  /** 事業所が代理受領する給付費（総費用額 − 利用者負担の1割分） */
  benefitAmount: number
  issuedAt: string | null
  paidAt: string | null
  receiptNo: string | null
  paymentMethod: string | null
  facility: {
    name: string
    facilityNumber: string
    postalCode: string | null
    address: string | null
    phone: string | null
  }
}

const CATEGORY_GROUP: Record<InvoiceLine['category'], string> = {
  copay: '障害児通所給付費 利用者負担分',
  daytime: '日中一時支援 利用者負担分',
  daytime_transport: '日中一時支援 利用者負担分',
  extra: '保険適用外（実費）',
  actual: '保険適用外（実費）',
}

const GROUP_ORDER = ['障害児通所給付費 利用者負担分', '日中一時支援 利用者負担分', '保険適用外（実費）']

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 6px',
  verticalAlign: 'middle',
}

const headCell: React.CSSProperties = {
  ...cell,
  background: '#f2f2f2',
  fontWeight: 600,
  textAlign: 'center',
}

export function InvoiceDocument({
  data,
  type,
}: {
  data: InvoiceDocumentData
  type: 'invoice' | 'receipt'
}) {
  const year = data.yearMonth.slice(0, 4)
  const month = data.yearMonth.slice(4, 6)
  const title = type === 'receipt' ? '領　収　書' : '請　求　書'

  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    lines: data.lines.filter((l) => CATEGORY_GROUP[l.category] === g),
  })).filter((g) => g.lines.length > 0)

  return (
    <div
      className="invoice-sheet"
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '10pt',
        color: '#000',
        width: '186mm',
        margin: '0 auto',
        padding: '2mm 0 8mm',
      }}
    >
      {/* タイトル */}
      <div style={{ textAlign: 'center', marginBottom: '6mm' }}>
        <span style={{ fontSize: '18pt', fontWeight: 700, letterSpacing: '0.4em' }}>{title}</span>
      </div>

      {/* 宛名 / 発行日 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5mm' }}>
        <div>
          <div style={{ fontSize: '13pt', borderBottom: '1px solid #000', paddingBottom: '2px', minWidth: '70mm' }}>
            {data.childName}　保護者　様
          </div>
          {data.certificateNumber && (
            <div style={{ fontSize: '8.5pt', marginTop: '2mm', color: '#333' }}>
              受給者証番号：{data.certificateNumber}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: '9pt', lineHeight: 1.7 }}>
          <div>
            {type === 'receipt' ? '領収日' : '発行日'}：
            {formatDate(type === 'receipt' ? data.paidAt : data.issuedAt) || '　　年　　月　　日'}
          </div>
          {type === 'receipt' && data.receiptNo && <div>領収番号：{data.receiptNo}</div>}
        </div>
      </div>

      {/* 対象期間・合計金額 */}
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '5mm' }}>
        <tbody>
          <tr>
            <td style={{ ...headCell, width: '32mm' }}>ご利用期間</td>
            <td style={{ ...cell }}>
              {year}年{month}月分（{year}年{month}月1日 〜 末日）
            </td>
          </tr>
          <tr>
            <td style={{ ...headCell }}>
              {type === 'receipt' ? '領収金額' : 'ご請求金額'}
            </td>
            <td style={{ ...cell, fontSize: '15pt', fontWeight: 700 }}>
              ￥{data.total.toLocaleString()}　-
            </td>
          </tr>
          {type === 'receipt' && (
            <tr>
              <td style={{ ...headCell }}>お支払方法</td>
              <td style={{ ...cell }}>{data.paymentMethod || '　'}</td>
            </tr>
          )}
        </tbody>
      </table>

      {type === 'receipt' && (
        <p style={{ margin: '0 0 5mm', fontSize: '10.5pt' }}>
          上記の金額を、正に領収いたしました。
        </p>
      )}

      {/* 明細 */}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '9pt' }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: '62mm' }}>項目</th>
            <th style={{ ...headCell }}>内容</th>
            <th style={{ ...headCell, width: '20mm' }}>単価</th>
            <th style={{ ...headCell, width: '16mm' }}>数量</th>
            <th style={{ ...headCell, width: '24mm' }}>金額</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.name}>
              <tr>
                <td colSpan={5} style={{ ...cell, background: '#fafafa', fontWeight: 600 }}>
                  {group.name}
                </td>
              </tr>
              {group.lines.map((line, i) => (
                <tr key={`${group.name}-${i}`}>
                  <td style={{ ...cell, paddingLeft: '10px' }}>{line.name}</td>
                  <td style={{ ...cell, fontSize: '8pt', color: '#333' }}>{line.detail ?? ''}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {line.unitPrice != null ? `${line.unitPrice.toLocaleString()}円` : '—'}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>{line.count > 0 ? line.count : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{line.amount.toLocaleString()}円</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td colSpan={4} style={{ ...headCell, textAlign: 'right' }}>
              合　計
            </td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700, fontSize: '11pt' }}>
              {data.total.toLocaleString()}円
            </td>
          </tr>
        </tbody>
      </table>

      {/* 給付費の内訳（参考） */}
      {data.totalCost > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '4mm', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ ...headCell, width: '46mm' }}>サービスの総費用額</td>
              <td style={{ ...cell, textAlign: 'right', width: '30mm' }}>{data.totalCost.toLocaleString()}円</td>
              <td style={{ ...headCell, width: '46mm' }}>市町村等からの給付費（代理受領分）</td>
              <td style={{ ...cell, textAlign: 'right' }}>{data.benefitAmount.toLocaleString()}円</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 事業所 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8mm' }}>
        <div style={{ fontSize: '9pt', lineHeight: 1.8, position: 'relative', paddingRight: '22mm' }}>
          <div style={{ fontSize: '11pt', fontWeight: 700 }}>{data.facility.name}</div>
          {data.facility.postalCode && <div>〒{data.facility.postalCode}</div>}
          {data.facility.address && <div>{data.facility.address}</div>}
          {data.facility.phone && <div>TEL：{data.facility.phone}</div>}
          <div>事業所番号：{data.facility.facilityNumber}</div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '6mm',
              width: '18mm',
              height: '18mm',
              border: '1px dashed #bbb',
              borderRadius: '2mm',
              color: '#bbb',
              fontSize: '7pt',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            印
          </div>
        </div>
      </div>

      {type === 'invoice' && (
        <p style={{ marginTop: '6mm', fontSize: '8pt', color: '#555' }}>
          ※ 障害児通所給付費の利用者負担額は、受給者証に記載の負担上限月額の範囲内で算定しています。<br />
          ※ 日中一時支援の利用者負担額は、負担上限月額とは別に算定しています。
        </p>
      )}
    </div>
  )
}
