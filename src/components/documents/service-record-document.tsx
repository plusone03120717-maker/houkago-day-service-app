// 様式5「放課後等デイサービス提供実績記録票 / 児童発達支援提供実績記録票」の
// 印刷レイアウト（A4縦・児童ごとに1枚）。実績記録票CSV（K611）と同じ日別データを描画する。

import type { ServiceDayRecord } from '@/lib/billing/aggregate'

export type ServiceRecordDocumentData = {
  yearMonth: string
  serviceType: 'afterschool' | 'development_support'
  childName: string
  certificateNumber: string
  /** 契約支給量（例: 10日/月）。未設定なら null */
  contractDays: number | null
  facility: { name: string; facilityNumber: string }
  days: ServiceDayRecord[]
  pageNo: number
  pageCount: number
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

const EXTENSION_LABEL: Record<number, string> = { 1: '1', 2: '2', 3: '3' }

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1px 2px',
  textAlign: 'center',
  height: '19px',
  fontSize: '8pt',
}
const head: React.CSSProperties = { ...cell, fontSize: '6.5pt', lineHeight: 1.15, padding: '2px 1px' }

/** 表の最低行数。実績が少ない月でも様式どおりの見た目になるように埋める */
const MIN_ROWS = 24

export function ServiceRecordDocument({ data }: { data: ServiceRecordDocumentData }) {
  const reiwaYear = parseInt(data.yearMonth.slice(0, 4)) - 2018
  const month = parseInt(data.yearMonth.slice(4, 6))
  const isAfterschool = data.serviceType === 'afterschool'
  const title = isAfterschool ? '放課後等デイサービス提供実績記録票' : '児童発達支援提供実績記録票'
  const serviceLabel = isAfterschool
    ? '放課後等デイサービス（重症心身障害児以外）'
    : '児童発達支援（重症心身障害児以外）'

  const rows = [...data.days].sort((a, b) => a.date.localeCompare(b.date))
  const padded: Array<ServiceDayRecord | null> = [...rows]
  while (padded.length < MIN_ROWS) padded.push(null)

  const totalHours = rows.reduce((s, d) => s + d.hours, 0)
  const transportCount = rows.reduce(
    (s, d) => s + (d.transportPickup ? 1 : 0) + (d.transportDropoff ? 1 : 0),
    0,
  )
  const extensionCount = rows.filter((d) => d.extensionLevel > 0).length
  const specializedCount = rows.filter((d) => d.specializedSupport).length

  return (
    <div
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '8.5pt',
        color: '#000',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '9pt' }}>（様式5）</div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '4px' }}>
        <div style={{ width: '20%' }}>令和{reiwaYear}年{month}月分</div>
        <h2 style={{ flex: 1, textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: 0 }}>
          {title}
        </h2>
        <div style={{ width: '20%' }} />
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ ...head, width: '9%' }}>受給者証<br />番号</td>
            <td style={{ ...cell, width: '17%', letterSpacing: '1px' }}>{data.certificateNumber}</td>
            <td style={{ ...head, width: '14%' }}>給付決定保護者氏名<br />（障害児氏名）</td>
            <td style={{ ...cell, width: '20%', textAlign: 'left', paddingLeft: '4px' }}>
              {data.childName}
              <br />（{data.childName}）
            </td>
            <td style={{ ...head, width: '11%' }}>事業所番号</td>
            <td style={{ ...cell, letterSpacing: '1px' }}>{data.facility.facilityNumber}</td>
          </tr>
          <tr>
            <td style={head}>契約支給量</td>
            <td colSpan={3} style={{ ...cell, textAlign: 'left', paddingLeft: '6px' }}>
              {serviceLabel}　{data.contractDays != null ? `${data.contractDays}日/月` : ''}
            </td>
            <td style={head}>事業者及び<br />その事業所</td>
            <td style={{ ...cell, textAlign: 'left', paddingLeft: '4px' }}>{data.facility.name}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ ...head, width: '4%' }}>日付</td>
            <td rowSpan={3} style={{ ...head, width: '4%' }}>曜日</td>
            <td colSpan={16} style={{ ...head, fontSize: '7pt' }}>サービス提供実績</td>
            <td rowSpan={3} style={{ ...head, width: '8%' }}>保護者等<br />確認欄</td>
            <td rowSpan={3} style={{ ...head, width: '11%' }}>備考</td>
          </tr>
          <tr>
            <td rowSpan={2} style={{ ...head, width: '5%' }}>サービス<br />提供<br />の状況</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>提供<br />形態</td>
            <td rowSpan={2} style={{ ...head, width: '6%' }}>開始<br />時間</td>
            <td rowSpan={2} style={{ ...head, width: '6%' }}>終了<br />時間</td>
            <td rowSpan={2} style={{ ...head, width: '5%' }}>算定<br />時間数</td>
            <td colSpan={2} style={{ ...head, width: '6%' }}>送迎加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>家族<br />支援<br />加算</td>
            <td rowSpan={2} style={{ ...head, width: '5%' }}>医療連携<br />体制加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>延長<br />支援<br />加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>集中的<br />支援加算</td>
            <td rowSpan={2} style={{ ...head, width: '6%' }}>専門的支援<br />加算<br />(支援実施時)</td>
            <td rowSpan={2} style={{ ...head, width: '5%' }}>通所自立<br />支援加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>入浴<br />支援<br />加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>子育て<br />サポート<br />加算</td>
            <td rowSpan={2} style={{ ...head, width: '4%' }}>自立<br />サポート<br />加算</td>
          </tr>
          <tr>
            <td style={{ ...head, width: '3%' }}>往</td>
            <td style={{ ...head, width: '3%' }}>復</td>
          </tr>

          {padded.map((d, i) => {
            const date = d ? new Date(d.date) : null
            return (
              <tr key={i}>
                <td style={cell}>{d ? parseInt(d.date.slice(8, 10)) : ''}</td>
                <td style={cell}>{date ? WEEKDAY[date.getDay()] : ''}</td>
                <td style={cell}>{d?.absent ? '欠席' : ''}</td>
                <td style={cell}>{d && !d.absent ? d.serviceFormType : ''}</td>
                <td style={cell}>{d?.startTime ?? ''}</td>
                <td style={cell}>{d?.endTime ?? ''}</td>
                <td style={cell}>{d && d.hours > 0 ? d.hours : ''}</td>
                <td style={cell}>{d?.transportPickup ? '1' : ''}</td>
                <td style={cell}>{d?.transportDropoff ? '1' : ''}</td>
                <td style={cell} />
                <td style={cell} />
                <td style={cell}>{d && d.extensionLevel > 0 ? EXTENSION_LABEL[d.extensionLevel] : ''}</td>
                <td style={cell} />
                <td style={cell}>{d?.specializedSupport ? '1' : ''}</td>
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
              </tr>
            )
          })}

          <tr>
            <td colSpan={6} style={{ ...cell, fontWeight: 600, height: '22px' }}>合　計</td>
            <td style={{ ...cell, fontWeight: 600 }}>{totalHours}</td>
            <td colSpan={2} style={{ ...cell, fontWeight: 600 }}>{transportCount}回</td>
            <td style={cell}>0回</td>
            <td style={cell}>0回</td>
            <td style={{ ...cell, fontWeight: 600 }}>{extensionCount}回</td>
            <td style={cell}>0回</td>
            <td style={{ ...cell, fontWeight: 600 }}>{specializedCount}回</td>
            <td style={cell}>0回</td>
            <td style={cell}>0回</td>
            <td style={cell}>0回</td>
            <td style={cell}>0回</td>
            <td style={cell} />
            <td style={cell} />
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ ...head, width: '150px' }}>保育・教育等移行支援加算</td>
              <td style={{ ...head, width: '70px' }}>移行日</td>
              <td style={{ ...cell, width: '120px' }} />
              <td style={{ ...head, width: '100px' }}>移行後算定日</td>
              <td style={{ ...cell, width: '120px' }} />
            </tr>
            <tr>
              <td style={head}>集中的支援加算</td>
              <td style={head}>支援開始日</td>
              <td style={cell} />
              <td style={{ border: 'none' }} />
              <td style={{ border: 'none' }} />
            </tr>
          </tbody>
        </table>
        <table style={{ borderCollapse: 'collapse', alignSelf: 'flex-end' }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: '34px' }}>{data.pageCount}</td>
              <td style={{ ...head, width: '40px' }}>枚中</td>
              <td style={{ ...cell, width: '34px' }}>{data.pageNo}</td>
              <td style={{ ...head, width: '30px' }}>枚</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
