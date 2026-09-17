// 様式第二「障害児通所給付費・入所給付費等明細書」の印刷レイアウト（A4縦・児童ごとに1枚）。
// 数字は請求CSVと同じ computeKokuhorenBilling の結果をそのまま表示する。

import type { ChildComputed } from '@/lib/kokuhoren/build'

export type KokuhorenDetailData = {
  yearMonth: string
  child: ChildComputed
  facility: { name: string; facilityNumber: string; regionLabel: string }
  /** 上限額管理事業所の名称（アプリで分かる場合） */
  upperLimitFacilityName: string | null
  pageNo: number
  pageCount: number
}

const SERVICE_KIND_LABEL: Record<string, string> = {
  '61': '児童発達支援',
  '62': '医療型児童発達支援',
  '63': '放課後等デイサービス',
  '64': '居宅訪問型児童発達支援',
  '65': '保育所等訪問支援',
}

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '2px 4px',
  verticalAlign: 'middle',
  height: '20px',
}
const label: React.CSSProperties = { ...cell, textAlign: 'center', fontSize: '8pt' }
const numCell: React.CSSProperties = { ...cell, textAlign: 'right' }
const hatch: React.CSSProperties = {
  ...cell,
  background: 'repeating-linear-gradient(135deg,#fff,#fff 5px,#ccc 5px,#ccc 6px)',
}

/** 1文字ずつ枠に入れる（受給者証番号・事業所番号など） */
function Boxes({
  value, length, width = 16, align = 'left',
}: { value: string; length: number; width?: number; align?: 'left' | 'right' }) {
  const raw = value ?? ''
  const chars = (align === 'right' ? raw.padStart(length, ' ') : raw.padEnd(length, ' '))
    .slice(0, length)
    .split('')
  return (
    <span style={{ display: 'inline-flex' }}>
      {chars.map((c, i) => (
        <span
          key={i}
          style={{
            width: `${width}px`,
            textAlign: 'center',
            borderRight: i === length - 1 ? 'none' : '1px solid #000',
            lineHeight: '18px',
          }}
        >
          {c.trim()}
        </span>
      ))}
    </span>
  )
}

/** YYYY-MM-DD → 令和の年月日セル */
function WarekiCells({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <>
        <td style={{ ...cell, width: '34px' }} />
        <td style={label}>年</td>
        <td style={{ ...cell, width: '26px' }} />
        <td style={label}>月</td>
        <td style={{ ...cell, width: '26px' }} />
        <td style={label}>日</td>
      </>
    )
  }
  const [y, m, d] = iso.split('-')
  return (
    <>
      <td style={{ ...cell, width: '34px', textAlign: 'center' }}>{parseInt(y) - 2018}</td>
      <td style={label}>年</td>
      <td style={{ ...cell, width: '26px', textAlign: 'center' }}>{parseInt(m)}</td>
      <td style={label}>月</td>
      <td style={{ ...cell, width: '26px', textAlign: 'center' }}>{parseInt(d)}</td>
      <td style={label}>日</td>
    </>
  )
}

export function KokuhorenDetailDocument({ data }: { data: KokuhorenDetailData }) {
  const c = data.child
  const reiwaYear = String(parseInt(data.yearMonth.slice(0, 4)) - 2018).padStart(2, '0')
  const month = data.yearMonth.slice(4, 6)
  const kind = c.serviceCode.slice(0, 2)
  const yen = (n: number) => n.toLocaleString('ja-JP')

  // 給付費明細欄は様式上10行ぶんの枠がある
  const lines = c.breakdown && c.breakdown.length > 0
    ? c.breakdown
    : [{ code: c.serviceCode, name: undefined as string | undefined, unitCount: 0, count: c.totalDays, units: c.totalUnits }]
  const detailRows = [...lines]
  while (detailRows.length < 10) detailRows.push(null as unknown as (typeof lines)[number])

  return (
    <div
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '8.5pt',
        color: '#000',
      }}
    >
      <div style={{ fontSize: '9pt', marginBottom: '3px' }}>（様式第二）</div>

      <div style={{ border: '1px solid #000', padding: '10px 12px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '12.5pt', fontWeight: 700, margin: '2px 0 10px' }}>
          障害児通所給付費・入所給付費等明細書
        </h2>

        {/* 都道府県等番号 / 年月 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...label, width: '110px' }}>都道府県等番号</td>
                <td style={cell}>
                  <Boxes value={c.municipalityCode} length={6} />
                </td>
              </tr>
              <tr>
                <td style={label}>助成自治体番号</td>
                <td style={cell}>
                  <Boxes value="" length={6} />
                </td>
              </tr>
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...label, padding: '2px 10px' }}>令和</td>
                <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{reiwaYear[0]}</td>
                <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{reiwaYear[1]}</td>
                <td style={label}>年</td>
                <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{month[0]}</td>
                <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{month[1]}</td>
                <td style={label}>月分</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 受給者 / 請求事業者 */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse', flex: 1 }}>
            <tbody>
              <tr>
                <td style={{ ...label, width: '130px' }}>受 給 者 証 番 号</td>
                <td style={cell}>
                  <Boxes value={c.certificateNumber} length={10} />
                </td>
              </tr>
              <tr>
                <td style={label}>
                  給付決定保護者
                  <br />
                  氏　　　　　名
                </td>
                <td style={{ ...cell, height: '30px', textAlign: 'center' }}>{c.childName}</td>
              </tr>
              <tr>
                <td style={label}>
                  給付決定に係る
                  <br />
                  障 害 児 氏 名
                </td>
                <td style={{ ...cell, height: '30px', textAlign: 'center' }}>{c.childName}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ borderCollapse: 'collapse', width: '48%' }}>
            <tbody>
              <tr>
                <td rowSpan={3} style={{ ...label, width: '16px', writingMode: 'vertical-rl' }}>
                  請求事業者
                </td>
                <td style={{ ...label, width: '100px' }}>指定事業所番号</td>
                <td style={cell}>
                  <Boxes value={data.facility.facilityNumber} length={10} />
                </td>
              </tr>
              <tr>
                <td style={label}>
                  事業者及び
                  <br />
                  その事業所
                  <br />
                  の 名 称
                </td>
                <td style={{ ...cell, height: '40px', textAlign: 'center' }}>{data.facility.name}</td>
              </tr>
              <tr>
                <td style={label}>地域区分</td>
                <td style={{ ...cell, textAlign: 'center' }}>{data.facility.regionLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 利用者負担上限月額 */}
        <table style={{ borderCollapse: 'collapse', marginTop: '8px' }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '150px' }}>利用者負担上限月額　①</td>
              <td style={cell}>
                <Boxes value={String(c.copayLimit)} length={6} align="right" />
              </td>
            </tr>
          </tbody>
        </table>

        {/* 上限額管理事業所 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...label, width: '110px' }}>
                利用者負担上限額
                <br />
                管 理 事 業 所
              </td>
              <td style={{ ...label, width: '100px' }}>指定事業所番号</td>
              <td style={cell}>
                <Boxes value={c.upperLimit?.officeNumber ?? ''} length={10} />
              </td>
              <td style={{ ...label, width: '70px' }}>管理結果</td>
              <td style={{ ...cell, width: '36px', textAlign: 'center' }}>{c.upperLimit?.result ?? ''}</td>
              <td style={{ ...label, width: '80px' }}>管理結果額</td>
              <td style={{ ...numCell, width: '80px' }}>
                {c.upperLimit?.resultAmount != null ? yen(c.upperLimit.resultAmount) : ''}
              </td>
            </tr>
            <tr>
              <td style={label}>事業所名称</td>
              <td colSpan={5} style={cell}>
                {data.upperLimitFacilityName ?? ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* サービス種別・開始終了・利用日数 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ ...label, width: '52px' }}>
                サービス
                <br />
                種　　別
              </td>
              <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{kind[0]}</td>
              <td style={{ ...cell, width: '20px', textAlign: 'center' }}>{kind[1]}</td>
              <td style={{ ...label, width: '62px' }}>開始年月日</td>
              <td style={label}>令和</td>
              <WarekiCells iso={c.startDate} />
              <td style={{ ...label, width: '62px' }}>終了年月日</td>
              <WarekiCells iso={c.contractEndDate} />
              <td style={{ ...label, width: '52px' }}>利用日数</td>
              <td style={{ ...cell, width: '20px', textAlign: 'center' }}>
                {String(c.totalDays).padStart(2, '0')[0]}
              </td>
              <td style={{ ...cell, width: '20px', textAlign: 'center' }}>
                {String(c.totalDays).padStart(2, '0')[1]}
              </td>
              <td style={{ ...label, width: '52px' }}>入院日数</td>
              <td style={{ ...cell, width: '34px' }} />
            </tr>
            <tr>
              <td style={cell} />
              <td style={cell} />
              <td style={label}>開始年月日</td>
              <td style={label}>令和</td>
              <WarekiCells iso={null} />
              <td style={label}>終了年月日</td>
              <WarekiCells iso={null} />
              <td style={label}>利用日数</td>
              <td style={cell} />
              <td style={cell} />
              <td style={label}>入院日数</td>
              <td style={cell} />
            </tr>
          </tbody>
        </table>

        {/* 給付費明細欄 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '16px' }} />
              <td style={{ ...label, width: '34%' }}>サービス内容</td>
              <td style={{ ...label, width: '15%' }}>サービスコード</td>
              <td style={{ ...label, width: '10%' }}>単位数</td>
              <td style={{ ...label, width: '8%' }}>回数</td>
              <td style={{ ...label, width: '15%' }}>サービス単位数</td>
              <td style={label}>摘要</td>
            </tr>
            {detailRows.map((l, i) => (
              <tr key={i}>
                {i === 0 && (
                  <td rowSpan={10} style={{ ...label, width: '16px', writingMode: 'vertical-rl' }}>
                    給付費明細欄
                  </td>
                )}
                <td style={{ ...cell, fontSize: '8pt' }}>{l?.name ?? ''}</td>
                <td style={{ ...cell, textAlign: 'center', letterSpacing: '2px' }}>{l?.code ?? ''}</td>
                <td style={numCell}>{l ? yen(l.unitCount) : ''}</td>
                <td style={numCell}>{l ? yen(l.count) : ''}</td>
                <td style={numCell}>{l ? yen(l.units) : ''}</td>
                <td style={cell} />
              </tr>
            ))}
          </tbody>
        </table>

        {/* 請求額集計欄 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '6px' }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '16px', border: 'none' }} />
              <td style={{ ...cell, border: 'none' }} colSpan={5} />
              <td style={{ ...label, width: '14%' }}>合　計</td>
            </tr>
            {[
              ['サービス種類コード', kind, SERVICE_KIND_LABEL[kind] ?? '', null],
              ['サービス利用日数', `${c.totalDays}日`, '', null],
              ['給付単位数', yen(c.totalUnits), '', yen(c.totalUnits)],
              ['単位数単価', `${(c.totalUnits > 0 ? c.totalCost / c.totalUnits : 0).toFixed(2)} 円/単位`, '', 'hatch'],
              ['総費用額', yen(c.totalCost), '', yen(c.totalCost)],
              ['１割相当額', yen(c.tenPercent), '', 'hatch'],
              ['利用者負担額②', yen(c.tenPercent), '', 'hatch'],
              ['上限月額調整（①②の内少ない数）', yen(c.capAdjusted), '', yen(c.capAdjusted)],
              ['調整後利用者負担額', '', '', ''],
              ['上限額管理後利用者負担額', c.managedCopay != null ? yen(c.managedCopay) : '', '', c.managedCopay != null ? yen(c.managedCopay) : ''],
              ['決定利用者負担額', yen(c.decidedCopay), '', yen(c.decidedCopay)],
              ['請求額　給付費', yen(c.benefitAmount), '', yen(c.benefitAmount)],
              ['自治体助成分請求額', '', '', ''],
            ].map(([rowLabel, value, note, total], i) => (
              <tr key={i}>
                {i === 0 && (
                  <td rowSpan={13} style={{ ...label, width: '16px', writingMode: 'vertical-rl' }}>
                    請求額集計欄
                  </td>
                )}
                <td style={{ ...label, width: '210px', textAlign: 'right', paddingRight: '6px' }}>
                  {rowLabel}
                </td>
                <td style={{ ...numCell, width: '22%' }}>{value}</td>
                <td style={{ ...cell, width: '10%', fontSize: '7pt' }}>{note}</td>
                <td style={{ ...cell, width: '14%' }} />
                <td style={{ ...cell, width: '14%' }} />
                {total === 'hatch' ? (
                  <td style={hatch} />
                ) : (
                  <td style={numCell}>{total}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 特定入所障害児食費等給付費・枚数 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ ...label, width: '96px' }}>
                  特定入所障害児
                  <br />
                  食費等給付費
                </td>
                <td style={label}>算定日額</td>
                <td style={label}>日数</td>
                <td style={label}>給付費請求額</td>
                <td style={label}>実費算定額</td>
              </tr>
              <tr>
                <td style={{ ...numCell, width: '70px' }}>0</td>
                <td style={{ ...numCell, width: '46px' }}>0</td>
                <td style={{ ...numCell, width: '80px' }}>0</td>
                <td style={{ ...numCell, width: '70px' }}>0</td>
              </tr>
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse', alignSelf: 'flex-end' }}>
            <tbody>
              <tr>
                <td style={{ ...cell, width: '30px', textAlign: 'center' }}>{data.pageCount}</td>
                <td style={label}>枚中</td>
                <td style={{ ...cell, width: '30px', textAlign: 'center' }}>{data.pageNo}</td>
                <td style={label}>枚目</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
