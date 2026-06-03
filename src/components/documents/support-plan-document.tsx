'use client'

import { useState } from 'react'
import { Pencil, Eye, Minus, Plus, AlignJustify, Save, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type AreaData = {
  label: string
  goal: string
  content: string
  assignee: string
  priority: string
  achievement: string
  kasan: string
  dbKey: string
  goalDbKey: string
  assigneeDbKey: string
  priorityDbKey: string
  achievementDbKey: string
  kasanDbKey: string
}

export type SupportPlanDocumentData = {
  planId: string
  childName: string
  planDate: string
  reviewDate: string
  wishes: string
  standardServiceTime: string
  supportPolicy: string
  longTermGoals: string
  shortTermGoals: string
  managerName: string
  areas: AreaData[]
}

type EditedValues = {
  wishes: string
  standardServiceTime: string
  supportPolicy: string
  longTermGoals: string
  shortTermGoals: string
  areaGoals: string[]
  areaContents: string[]
  areaAssignees: string[]
  areaPriorities: string[]
  areaAchievements: string[]
  areaKasans: string[]
}

const FONT_SIZES = [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const ROW_HEIGHTS = {
  compact: { section: 28, area: 36 },
  normal:  { section: 36, area: 48 },
  large:   { section: 48, area: 64 },
}

export function SupportPlanDocument({ data }: { data: SupportPlanDocumentData }) {
  const supabase = createClient()

  const [editMode, setEditMode] = useState(false)
  const [fontIdx, setFontIdx]   = useState(2)   // 7.5pt
  const [rowSize, setRowSize]   = useState<'compact' | 'normal' | 'large'>('normal')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const [values, setValues] = useState<EditedValues>({
    wishes:              data.wishes,
    standardServiceTime: data.standardServiceTime,
    supportPolicy:       data.supportPolicy,
    longTermGoals: data.longTermGoals,
    shortTermGoals: data.shortTermGoals,
    areaGoals:      data.areas.map((a) => a.goal),
    areaContents:   data.areas.map((a) => a.content),
    areaAssignees:    data.areas.map((a) => a.assignee),
    areaPriorities:   data.areas.map((a) => a.priority),
    areaAchievements: data.areas.map((a) => a.achievement),
    areaKasans:       data.areas.map((a) => a.kasan),
  })

  const fontSize = FONT_SIZES[fontIdx]
  const heights  = ROW_HEIGHTS[rowSize]

  const handleSave = async () => {
    setSaving(true)
    const payload: Record<string, string> = {
      family_wishes:         values.wishes,
      standard_service_time: values.standardServiceTime,
      support_policy:        values.supportPolicy,
      long_term_goals:  values.longTermGoals,
      short_term_goals: values.shortTermGoals,
    }
    data.areas.forEach((area, i) => {
      payload[area.dbKey]          = values.areaContents[i]   ?? ''
      payload[area.goalDbKey]      = values.areaGoals[i]      ?? ''
      payload[area.assigneeDbKey]    = values.areaAssignees[i]    ?? ''
      payload[area.priorityDbKey]    = values.areaPriorities[i]   ?? ''
      payload[area.achievementDbKey] = values.areaAchievements[i] ?? ''
      payload[area.kasanDbKey]       = values.areaKasans[i]       ?? ''
    })
    await supabase.from('support_plans').update(payload).eq('id', data.planId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // ── スタイル定義 ─────────────────────────────────────────────────────────
  const cell: React.CSSProperties = {
    border: '1px solid #111',
    padding: '2px 4px',
    verticalAlign: 'top',
    lineHeight: 1.45,
    fontSize: `${fontSize}pt`,
  }
  const lbl: React.CSSProperties = {
    ...cell,
    backgroundColor: '#eeeeee',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    fontSize: `${Math.max(6, fontSize - 0.5)}pt`,
  }
  const th: React.CSSProperties = {
    ...cell,
    backgroundColor: '#e0e0e0',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: `${Math.max(6, fontSize - 0.5)}pt`,
  }
  const taBase: React.CSSProperties = {
    display: 'block',
    width: '100%',
    background: '#fffbeb',
    border: '1.5px dashed #f59e0b',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    lineHeight: 1.45,
    padding: '1px 3px',
    resize: 'vertical',
    boxSizing: 'border-box',
  }

  // ── ヘルパー ────────────────────────────────────────────────────────────
  const EditCell = ({
    value, minHeight, onChange,
  }: { value: string; minHeight: number; onChange: (v: string) => void }) =>
    editMode ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...taBase, minHeight }}
      />
    ) : (
      <span style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{value}</span>
    )

  return (
    <>
      {/* ─── 編集ツールバー（印刷時非表示）────────────────────── */}
      <div className="print:hidden mb-4 flex flex-wrap items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">

        {/* 編集モード切替 */}
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

        {/* 保存ボタン（編集モードのとき表示） */}
        {editMode && (
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '変更を保存'}
          </button>
        )}

        {/* 保存完了メッセージ */}
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
            <CheckCircle className="h-4 w-4" />
            保存しました
          </span>
        )}

        {/* 文字サイズ */}
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

        {/* 行の高さ */}
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
            ✏️ 各テキストエリアを直接編集できます。「変更を保存」で支援計画に反映されます。
          </p>
        )}
      </div>

      {/* ─── 帳票本体 ────────────────────────────────────────────── */}
      <div style={{
        fontFamily: "var(--font-noto-sans-jp), 'Hiragino Sans', 'Yu Gothic', sans-serif",
        fontSize: `${fontSize}pt`,
        color: '#000',
      }}>
        {/* タイトル行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
          <span>利用時氏名：{data.childName}</span>
          <strong style={{ fontSize: `${fontSize + 3.5}pt`, letterSpacing: '0.15em' }}>個別支援計画書</strong>
          <span>作成年月日　{data.planDate}</span>
        </div>

        {/* 意向・方針 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ ...lbl, width: '72px', verticalAlign: 'middle' }}>利用児及び家族の{'\n'}生活に対する意向</td>
              <td style={{ ...cell, minHeight: heights.section }}>
                <EditCell
                  value={values.wishes}
                  minHeight={heights.section}
                  onChange={(v) => setValues((p) => ({ ...p, wishes: v }))}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...lbl, verticalAlign: 'middle' }}>総合的な支援の方針</td>
              <td style={{ ...cell, minHeight: heights.section }}>
                <EditCell
                  value={values.supportPolicy}
                  minHeight={heights.section}
                  onChange={(v) => setValues((p) => ({ ...p, supportPolicy: v }))}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* 目標 */}
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ ...lbl, width: '72px', verticalAlign: 'middle' }}>長期目標{'\n'}（内容・期間等）</td>
              <td style={{ ...cell, minHeight: heights.section }}>
                <EditCell
                  value={values.longTermGoals}
                  minHeight={heights.section}
                  onChange={(v) => setValues((p) => ({ ...p, longTermGoals: v }))}
                />
              </td>
              <td style={{ ...lbl, width: '88px', fontSize: `${Math.max(6, fontSize - 1)}pt` }} rowSpan={2}>
                支援の標準的な提供時間等{'\n'}（曜日・頻度・時間）
              </td>
              <td style={{ ...cell, width: '60px' }} rowSpan={2}>
                <EditCell
                  value={values.standardServiceTime}
                  minHeight={heights.section * 2}
                  onChange={(v) => setValues((p) => ({ ...p, standardServiceTime: v }))}
                />
              </td>
            </tr>
            <tr>
              <td style={{ ...lbl, verticalAlign: 'middle' }}>短期目標{'\n'}（内容・期間等）</td>
              <td style={{ ...cell, minHeight: heights.section }}>
                <EditCell
                  value={values.shortTermGoals}
                  minHeight={heights.section}
                  onChange={(v) => setValues((p) => ({ ...p, shortTermGoals: v }))}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* 支援テーブル */}
        <div style={{ fontSize: `${Math.max(6, fontSize - 0.5)}pt`, marginBottom: '1px' }}>○支援目標及び具体的な支援内容等</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '4px' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '50px' }}>項　目</th>
              <th style={{ ...th, width: '132px' }}>支援目標{'\n'}（具体的な到達目標）</th>
              <th style={{ ...th }}>
                支援内容{'\n'}
                <span style={{ fontWeight: 'normal', fontSize: `${Math.max(5.5, fontSize - 1.5)}pt` }}>
                  （内容・支援の提供上のポイント・5領域（※）との関連性等）
                </span>
              </th>
              <th style={{ ...th, width: '36px' }}>達成時期</th>
              <th style={{ ...th, width: '56px' }}></th>
              <th style={{ ...th, width: '36px' }}>担当者</th>
              <th style={{ ...th, width: '26px' }}>優先順位</th>
            </tr>
          </thead>
          <tbody>
            {data.areas.map((area, i) => (
              <tr key={i}>
                <td style={{ ...lbl, whiteSpace: 'pre-line', minHeight: heights.area, verticalAlign: 'middle' }}>
                  {area.label}
                </td>
                {/* 支援目標 */}
                <td style={{ ...cell, minHeight: heights.area }}>
                  <EditCell
                    value={values.areaGoals[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaGoals]
                      next[i] = v
                      return { ...p, areaGoals: next }
                    })}
                  />
                </td>
                {/* 支援内容（DB保存対象） */}
                <td style={{ ...cell, minHeight: heights.area }}>
                  <EditCell
                    value={values.areaContents[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaContents]
                      next[i] = v
                      return { ...p, areaContents: next }
                    })}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'center', verticalAlign: 'middle', fontSize: `${Math.max(6, fontSize - 0.5)}pt` }}>
                  <EditCell
                    value={values.areaAchievements[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaAchievements]; next[i] = v
                      return { ...p, areaAchievements: next }
                    })}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'center', fontSize: `${Math.max(5.5, fontSize - 1)}pt` }}>
                  <EditCell
                    value={values.areaKasans[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaKasans]; next[i] = v
                      return { ...p, areaKasans: next }
                    })}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'center', verticalAlign: 'middle', fontSize: `${Math.max(6, fontSize - 0.5)}pt` }}>
                  <EditCell
                    value={values.areaAssignees[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaAssignees]; next[i] = v
                      return { ...p, areaAssignees: next }
                    })}
                  />
                </td>
                <td style={{ ...cell, textAlign: 'center', verticalAlign: 'middle', fontSize: `${Math.max(6, fontSize - 0.5)}pt` }}>
                  <EditCell
                    value={values.areaPriorities[i] ?? ''}
                    minHeight={heights.area}
                    onChange={(v) => setValues((p) => {
                      const next = [...p.areaPriorities]; next[i] = v
                      return { ...p, areaPriorities: next }
                    })}
                  />
                </td>
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
