// 様式第一「障害児通所給付費・入所給付費等請求書」の印刷レイアウト（A4縦・市町村ごとに1枚）。
// 国保連に送るCSVと同じ計算結果（lib/kokuhoren/build の computeKokuhorenBilling）を描画する。

export type InvoiceServiceLine = {
  /** サービス種類コード（61=児童発達支援 / 63=放課後等デイサービス） */
  kind: string
  count: number
  units: number
  totalCost: number
  benefitAmount: number
  copayAmount: number
}

export type KokuhorenInvoiceData = {
  yearMonth: string
  /** 請求先の都道府県等番号（市町村番号6桁） */
  municipalityCode: string
  /** 請求日（通常はサービス提供月の翌月1日） */
  claimDate: string
  facility: {
    name: string
    facilityNumber: string
    postalCode: string | null
    address: string | null
    phone: string | null
  }
  lines: InvoiceServiceLine[]
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
  padding: '3px 5px',
  verticalAlign: 'middle',
}
const headCell: React.CSSProperties = { ...cell, textAlign: 'center', fontWeight: 400 }
const numCell: React.CSSProperties = { ...cell, textAlign: 'right' }

/** 請求金額を百万・千・円の位で区切った桁枠に流し込む（様式第一の金額欄） */
function AmountBoxes({ amount }: { amount: number }) {
  const digits = String(amount).padStart(8, ' ').slice(-8).split('')
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        <tr>
          <td style={{ ...headCell, width: '28%' }}>請　求　金　額</td>
          {digits.map((d, i) => (
            <td
              key={i}
              style={{
                ...cell,
                textAlign: 'center',
                width: '9%',
                height: '30px',
                position: 'relative',
                fontSize: '12pt',
              }}
            >
              {(i === 2 || i === 5 || i === 7) && (
                <span style={{ position: 'absolute', top: '1px', left: '3px', fontSize: '6pt' }}>
                  {i === 2 ? '百万' : i === 5 ? '千' : '円'}
                </span>
              )}
              <span style={{ display: 'block', marginTop: '6px' }}>{d.trim()}</span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

/** 指定事業所番号を1桁ずつ枠に入れる */
function NumberBoxes({ value, length }: { value: string; length: number }) {
  const digits = value.padEnd(length, ' ').slice(0, length).split('')
  return (
    <span style={{ display: 'inline-flex' }}>
      {digits.map((d, i) => (
        <span
          key={i}
          style={{
            width: '15px',
            textAlign: 'center',
            borderRight: i === length - 1 ? 'none' : '1px dotted #666',
          }}
        >
          {d.trim()}
        </span>
      ))}
    </span>
  )
}

function formatJpDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((v) => parseInt(v))
  // 令和は西暦 - 2018
  return `令和${y - 2018}年${m}月${d}日`
}

export function KokuhorenInvoiceDocument({ data }: { data: KokuhorenInvoiceData }) {
  const reiwaYear = String(parseInt(data.yearMonth.slice(0, 4)) - 2018).padStart(2, '0')
  const month = data.yearMonth.slice(4, 6)

  const totalCount = data.lines.reduce((s, l) => s + l.count, 0)
  const totalUnits = data.lines.reduce((s, l) => s + l.units, 0)
  const totalCost = data.lines.reduce((s, l) => s + l.totalCost, 0)
  const totalBenefit = data.lines.reduce((s, l) => s + l.benefitAmount, 0)
  const totalCopay = data.lines.reduce((s, l) => s + l.copayAmount, 0)

  // 通所給付費の行は様式上4行ぶんの枠がある
  const tsushoRows = [...data.lines]
  while (tsushoRows.length < 4) tsushoRows.push(null as unknown as InvoiceServiceLine)

  const yen = (n: number) => n.toLocaleString('ja-JP')

  return (
    <div
      style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: '9.5pt',
        color: '#000',
      }}
    >
      <div style={{ fontSize: '9pt', marginBottom: '4px' }}>（様式第一）</div>

      <div style={{ border: '1px solid #000', padding: '14px 16px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 700, margin: '4px 0 14px' }}>
          障害児通所給付費・入所給付費等請求書
        </h2>

        <div style={{ textAlign: 'right', marginBottom: '8px' }}>{formatJpDate(data.claimDate)}</div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingTop: '8px' }}>
            <div style={{ marginBottom: '28px' }}>（　請　求　先　）</div>
            <div style={{ paddingLeft: '24px' }}>
              保険者　{data.municipalityCode}　　殿
            </div>
            <div style={{ marginTop: '32px' }}>下記のとおり請求します。</div>
          </div>

          <table style={{ borderCollapse: 'collapse', width: '55%' }}>
            <tbody>
              <tr>
                <td
                  rowSpan={4}
                  style={{ ...cell, width: '18px', textAlign: 'center', writingMode: 'vertical-rl' }}
                >
                  請求事業者
                </td>
                <td style={{ ...headCell, width: '32%' }}>指定事業所番号</td>
                <td style={cell}>
                  <NumberBoxes value={data.facility.facilityNumber} length={10} />
                </td>
              </tr>
              <tr>
                <td style={headCell}>
                  住　所
                  <br />
                  （所在地）
                </td>
                <td style={{ ...cell, height: '52px', fontSize: '8.5pt' }}>
                  {data.facility.postalCode && <div>〒{data.facility.postalCode}</div>}
                  <div>{data.facility.address ?? ''}</div>
                </td>
              </tr>
              <tr>
                <td style={headCell}>電話番号</td>
                <td style={cell}>{data.facility.phone ?? ''}</td>
              </tr>
              <tr>
                <td style={headCell}>名　称</td>
                <td style={{ ...cell, height: '34px' }}>{data.facility.name}</td>
              </tr>
              <tr>
                <td style={{ ...cell, borderTop: 'none' }} />
                <td style={headCell}>職・氏名</td>
                <td style={{ ...cell, height: '34px' }} />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'center' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...headCell, padding: '4px 12px' }}>令和</td>
                <td style={{ ...cell, padding: '4px 10px' }}>{reiwaYear[0]}</td>
                <td style={{ ...cell, padding: '4px 10px' }}>{reiwaYear[1]}</td>
                <td style={{ ...headCell, padding: '4px 8px' }}>年</td>
                <td style={{ ...cell, padding: '4px 10px' }}>{month[0]}</td>
                <td style={{ ...cell, padding: '4px 10px' }}>{month[1]}</td>
                <td style={{ ...headCell, padding: '4px 8px' }}>月分</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <AmountBoxes amount={totalBenefit} />
        </div>

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...headCell, width: '30%' }}>
                区　　分
              </td>
              <td style={{ ...headCell, width: '10%' }}>件数</td>
              <td style={{ ...headCell, width: '13%' }}>単位数</td>
              <td style={{ ...headCell, width: '14%' }}>費用合計</td>
              <td style={{ ...headCell, width: '13%' }}>
                給付費
                <br />
                請求額
              </td>
              <td style={{ ...headCell, width: '10%' }}>
                利用者
                <br />
                負担額
              </td>
              <td style={{ ...headCell, width: '10%' }}>
                自治体
                <br />
                助成額
              </td>
            </tr>

            {tsushoRows.map((l, i) => (
              <tr key={`tsusho-${i}`}>
                {i === 0 && (
                  <td
                    rowSpan={4}
                    style={{ ...cell, width: '18px', textAlign: 'center', writingMode: 'vertical-rl', fontSize: '8pt' }}
                  >
                    障害児通所給付費
                  </td>
                )}
                <td style={{ ...cell, height: '26px' }}>
                  {l ? SERVICE_KIND_LABEL[l.kind] ?? `サービス種類${l.kind}` : ''}
                </td>
                <td style={numCell}>{l ? yen(l.count) : ''}</td>
                <td style={numCell}>{l ? yen(l.units) : ''}</td>
                <td style={numCell}>{l ? yen(l.totalCost) : ''}</td>
                <td style={numCell}>{l ? yen(l.benefitAmount) : ''}</td>
                <td style={numCell}>{l ? yen(l.copayAmount) : ''}</td>
                <td style={numCell}>{l ? '0' : ''}</td>
              </tr>
            ))}

            {[0, 1, 2].map((i) => (
              <tr key={`nyusho-${i}`}>
                {i === 0 && (
                  <td
                    rowSpan={3}
                    style={{ ...cell, width: '18px', textAlign: 'center', writingMode: 'vertical-rl', fontSize: '8pt' }}
                  >
                    障害児入所給付費
                  </td>
                )}
                <td style={{ ...cell, height: '26px' }} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
              </tr>
            ))}

            <tr>
              <td colSpan={2} style={{ ...headCell, height: '26px' }}>
                小　　計
              </td>
              <td style={numCell}>{yen(totalCount)}</td>
              <td style={numCell}>{yen(totalUnits)}</td>
              <td style={numCell}>{yen(totalCost)}</td>
              <td style={numCell}>{yen(totalBenefit)}</td>
              <td style={numCell}>{yen(totalCopay)}</td>
              <td style={numCell}>0</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...headCell, height: '26px', fontSize: '8.5pt' }}>
                特定入所障害児食費等給付費
              </td>
              <td style={cell} />
              <td style={{ ...cell, background: 'repeating-linear-gradient(135deg,#fff,#fff 6px,#ddd 6px,#ddd 7px)' }} />
              <td style={cell} />
              <td style={cell} />
              <td style={{ ...cell, background: 'repeating-linear-gradient(135deg,#fff,#fff 6px,#ddd 6px,#ddd 7px)' }} />
              <td style={cell} />
            </tr>
            <tr>
              <td colSpan={2} style={{ ...headCell, height: '26px' }}>
                合　　計
              </td>
              <td style={numCell}>{yen(totalCount)}</td>
              <td style={numCell}>{yen(totalUnits)}</td>
              <td style={numCell}>{yen(totalCost)}</td>
              <td style={numCell}>{yen(totalBenefit)}</td>
              <td style={numCell}>{yen(totalCopay)}</td>
              <td style={numCell}>0</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
