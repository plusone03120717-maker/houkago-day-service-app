'use client'

import { useState } from 'react'
import { Pencil, Eye, Minus, Plus, AlignJustify } from 'lucide-react'

export type SupportPlanDocumentData = {
  childName: string
  planDate: string
  reviewDate: string
  wishes: string
  supportPolicy: string
  longTermGoals: string
  shortTermGoals: string
  managerName: string
  areas: { label: string; content: string; kasan: string }[]
}

const FONT_SIZES = [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const ROW_HEIGHTS = {
  compact: { section: 28, area: 38 },
  normal:  { section: 36, area: 48 },
  large:   { section: 48, area: 64 },
}

function EditableCell({
  children,
  editable,
  className,
  style,
}: {
  children?: string
  editable: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <td
      contentEditable={editable}
      suppressContentEditableWarning
      className={className}
      style={{
        ...style,
        outline: editable ? '2px dashed #f59e0b' : undefined,
        cursor: editable ? 'text' : undefined,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {children}
    </td>
  )
}

export function SupportPlanDocument({ data }: { data: SupportPlanDocumentData }) {
  const [editMode, setEditMode] = useState(false)
  const [fontIdx, setFontIdx] = useState(2)          // 7.5pt
  const [rowSize, setRowSize] = useState<'compact' | 'normal' | 'large'>('normal')

  const fontSize   = FONT_SIZES[fontIdx]
  const heights    = ROW_HEIGHTS[rowSize]

  const cellStyle: React.CSSProperties = {
    border: '1px solid #111',
    padding: '2px 4px',
    verticalAlign: 'top',
    lineHeight: 1.45,
    fontSize: `${fontSize}pt`,
  }
  const labelStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#eeeeee',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    fontSize: `${Math.max(6, fontSize - 0.5)}pt`,
  }
  const thStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#e0e0e0',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: `${Math.max(6, fontSize - 0.5)}pt`,
  }

  return (
    <>
      {/* ─── 編集ツールバー（印刷時非表示）──────────────────────── */}
      <div className="print:hidden mb-4 flex flex-wrap items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            editMode
              ? 'bg-amber-500 text-white shadow'
              : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50'
          }`}
        >
          {editMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {editMode ? '編集を終了する' : '帳票を編集する'}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 shrink-0">文字サイズ</span>
          <button
            onClick={() => setFontIdx((i) => Math.max(0, i - 1))}
            disabled={fontIdx === 0}
            className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-mono w-10 text-center">{fontSize}pt</span>
          <button
            onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
            disabled={fontIdx === FONT_SIZES.length - 1}
            className="p-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <AlignJustify className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-500 shrink-0">行の高さ</span>
          {(['compact', 'normal', 'large'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setRowSize(s)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                rowSize === s
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {{ compact: 'コンパクト', normal: '標準', large: '広め' }[s]}
            </button>
          ))}
        </div>

        {editMode && (
          <p className="text-xs text-amber-700 w-full mt-0.5">
            ✏️ 各セルをクリックして直接編集できます。編集後に「印刷する」または「PDFとして保存」を押してください。
          </p>
        )}
      </div>

      {/* ─── 帳票本体 ────────────────────────────────────────────── */}
      <div
        style={{
          fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
          fontSize: `${fontSize}pt`,
          color: '#000',
          width: '190mm',
          margin: '0 auto',
        }}
      >
        {/* タイトル行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px', fontSize: `${fontSize}pt` }}>
          <span>利用時氏名：{data.childName}</span>
          <strong style={{ fontSize: `${fontSize + 3.5}pt`, letterSpacing: '0.15em' }}>個別支援計画書</strong>
          <span>作成年月日　{data.planDate}</span>
        </div>

        {/* 意向・方針 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '72px', verticalAlign: 'middle' }}>利用児及び家族の{'\n'}生活に対する意向</td>
              <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.section}px` }}>
                {data.wishes}
              </EditableCell>
            </tr>
            <tr>
              <td style={{ ...labelStyle, verticalAlign: 'middle' }}>総合的な支援の方針</td>
              <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.section}px` }}>
                {data.supportPolicy}
              </EditableCell>
            </tr>
          </tbody>
        </table>

        {/* 目標 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '72px', verticalAlign: 'middle' }}>長期目標{'\n'}（内容・期間等）</td>
              <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.section}px` }}>
                {data.longTermGoals}
              </EditableCell>
              <td style={{ ...labelStyle, width: '88px', fontSize: `${Math.max(6, fontSize - 1)}pt` }} rowSpan={2}>
                支援の標準的な提供時間等{'\n'}（曜日・頻度・時間）
              </td>
              <td style={{ ...cellStyle, width: '52px' }} rowSpan={2}></td>
            </tr>
            <tr>
              <td style={{ ...labelStyle, verticalAlign: 'middle' }}>短期目標{'\n'}（内容・期間等）</td>
              <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.section}px` }}>
                {data.shortTermGoals}
              </EditableCell>
            </tr>
          </tbody>
        </table>

        {/* 支援テーブル */}
        <div style={{ fontSize: `${Math.max(6, fontSize - 0.5)}pt`, marginBottom: '1px' }}>○支援目標及び具体的な支援内容等</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '4px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '50px' }}>項　目</th>
              <th style={{ ...thStyle, width: '88px' }}>支援目標{'\n'}（具体的な到達目標）</th>
              <th style={{ ...thStyle }}>
                支援内容{'\n'}
                <span style={{ fontWeight: 'normal', fontSize: `${Math.max(5.5, fontSize - 1.5)}pt` }}>
                  （内容・支援の提供上のポイント・5領域（※）との関連性等）
                </span>
              </th>
              <th style={{ ...thStyle, width: '36px' }}>達成時期</th>
              <th style={{ ...thStyle, width: '56px' }}></th>
              <th style={{ ...thStyle, width: '36px' }}>担当者</th>
              <th style={{ ...thStyle, width: '26px' }}>優先順位</th>
            </tr>
          </thead>
          <tbody>
            {data.areas.map((area, i) => (
              <tr key={i}>
                <td style={{ ...labelStyle, whiteSpace: 'pre-line', minHeight: `${heights.area}px`, verticalAlign: 'middle' }}>
                  {area.label}
                </td>
                <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.area}px` }}>
                  {''}
                </EditableCell>
                <EditableCell editable={editMode} style={{ ...cellStyle, minHeight: `${heights.area}px` }}>
                  {area.content}
                </EditableCell>
                <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'middle', fontSize: `${Math.max(6, fontSize - 0.5)}pt` }}>
                  {data.reviewDate}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: `${Math.max(5.5, fontSize - 1)}pt` }}>
                  {area.kasan}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'middle', fontSize: `${Math.max(6, fontSize - 0.5)}pt` }}>
                  {data.managerName}
                </td>
                <td style={{ ...cellStyle }}></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* フッター */}
        <div style={{ fontSize: `${Math.max(5.5, fontSize - 1.5)}pt`, color: '#333', marginBottom: '4px' }}>
          ※5領域の視点「健康・生活」「運動・感覚」「認知・行動」「言語・コミュニケーション」「人間関係・社会性」<br />
          本計画書に基づき支援の説明を受け、内容に同意しました。
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: `${fontSize}pt` }}>
          <div>
            提供する支援内容について、本計画書に基づき説明しました。<br />
            児童発達支援管理責任者氏名：{data.managerName}
          </div>
          <div style={{ textAlign: 'right' }}>
            　　年　　月　　日　　（保護者署名）
          </div>
        </div>
      </div>
    </>
  )
}
