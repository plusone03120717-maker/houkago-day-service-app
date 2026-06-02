'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

export type SupportPlanExcelData = {
  childName: string
  planDate: string
  reviewDate: string
  wishes: string
  supportPolicy: string
  longTermGoals: string
  shortTermGoals: string
  managerName: string
  areas: {
    label: string
    content: string
    kasan: string
  }[]
}

export function ExcelExportButton({ data }: { data: SupportPlanExcelData }) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')

      // セルのスタイル定義（xlsx では !merges でマージのみ対応）
      // 列インデックス: A=0 B=1 C=2 D=3 E=4 F=5 G=6
      //  A: 項目ラベル
      //  B: 支援目標
      //  C: 支援内容（広い）
      //  D: 達成時期
      //  E: 加算
      //  F: 担当者
      //  G: 優先順位

      const aoa: (string | null)[][] = []

      // ─── 行 0: タイトル行 ───────────────────────────────────────
      aoa.push([`利用時氏名：${data.childName}`, null, '個別支援計画書', null, null, `作成年月日　${data.planDate}`, null])

      // ─── 行 1: 利用児及び家族の意向 ────────────────────────────
      aoa.push(['利用児及び家族の生活に対する意向', data.wishes, null, null, null, null, null])

      // ─── 行 2: 総合的な支援の方針 ──────────────────────────────
      aoa.push(['総合的な支援の方針', data.supportPolicy || '', null, null, null, null, null])

      // ─── 行 3: 長期目標 ─────────────────────────────────────────
      aoa.push(['長期目標（内容・期間等）', data.longTermGoals || '', null, null, '支援の標準的な提供時間等（曜日・頻度・時間）', null, null])

      // ─── 行 4: 短期目標 ─────────────────────────────────────────
      aoa.push(['短期目標（内容・期間等）', data.shortTermGoals || '', null, null, '', null, null])

      // ─── 行 5: セクション見出し ─────────────────────────────────
      aoa.push(['○支援目標及び具体的な支援内容等', null, null, null, null, null, null])

      // ─── 行 6: テーブルヘッダー ─────────────────────────────────
      aoa.push([
        '項目',
        '支援目標（具体的な到達目標）',
        '支援内容（内容・支援の提供上のポイント・5領域（※）との関連性等）',
        '達成時期',
        '',
        '担当者',
        '優先順位',
      ])

      // ─── 行 7〜13: 支援領域 ──────────────────────────────────────
      for (const area of data.areas) {
        aoa.push([
          area.label,
          '',
          area.content || '',
          data.reviewDate,
          area.kasan,
          data.managerName,
          '',
        ])
      }

      // ─── フッター行 ──────────────────────────────────────────────
      const footerRow = 7 + data.areas.length
      aoa.push(['※5領域の視点「健康・生活」「運動・感覚」「認知・行動」「言語・コミュニケーション」「人間関係・社会性」', null, null, null, null, null, null])
      aoa.push(['本計画書に基づき支援の説明を受け、内容に同意しました。', null, null, null, null, null, null])
      aoa.push([
        '提供する支援内容について、本計画書に基づき説明しました。',
        null, null, null,
        '年　　月　　日',
        '（保護者署名）',
        null,
      ])
      aoa.push([`児童発達支援管理責任者氏名：${data.managerName}`, null, null, null, null, null, null])

      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // ─── セルの結合 ──────────────────────────────────────────────
      ws['!merges'] = [
        // タイトル行
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },  // 利用時氏名
        { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } },  // 個別支援計画書（中央）
        { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },  // 作成年月日

        // 意向・方針
        { s: { r: 1, c: 1 }, e: { r: 1, c: 6 } },  // 意向 内容
        { s: { r: 2, c: 1 }, e: { r: 2, c: 6 } },  // 方針 内容

        // 目標（提供時間欄は右側で2行結合）
        { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },  // 長期目標 内容
        { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },  // 短期目標 内容
        { s: { r: 3, c: 4 }, e: { r: 4, c: 6 } },  // 提供時間（2行結合）

        // セクション見出し
        { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } },

        // フッター
        { s: { r: footerRow, c: 0 }, e: { r: footerRow, c: 6 } },
        { s: { r: footerRow + 1, c: 0 }, e: { r: footerRow + 1, c: 6 } },
        { s: { r: footerRow + 2, c: 0 }, e: { r: footerRow + 2, c: 3 } },
        { s: { r: footerRow + 3, c: 0 }, e: { r: footerRow + 3, c: 6 } },
      ]

      // ─── 列幅（A4に収まる比率に調整）──────────────────────────
      ws['!cols'] = [
        { wch: 10 },  // A: 項目
        { wch: 16 },  // B: 支援目標
        { wch: 36 },  // C: 支援内容
        { wch: 10 },  // D: 達成時期
        { wch: 14 },  // E: 加算
        { wch: 10 },  // F: 担当者
        { wch: 6 },   // G: 優先順位
      ]

      // ─── 行高さ（A4 1枚に収まるよう設定）──────────────────────
      const rowHeights: { hpt: number }[] = [
        { hpt: 18 },  // 0: タイトル
        { hpt: 36 },  // 1: 意向
        { hpt: 36 },  // 2: 方針
        { hpt: 36 },  // 3: 長期目標
        { hpt: 36 },  // 4: 短期目標
        { hpt: 12 },  // 5: 見出し
        { hpt: 22 },  // 6: テーブルヘッダー
        ...data.areas.map(() => ({ hpt: 46 })),  // 7〜: 各領域（7行）
        { hpt: 14 },  // フッター1
        { hpt: 14 },  // フッター2
        { hpt: 14 },  // フッター3
        { hpt: 14 },  // フッター4
      ]
      ws['!rows'] = rowHeights

      // ─── 印刷設定（A4・1ページに収める）───────────────────────
      ws['!pageSetup'] = {
        paperSize: 9,          // 9 = A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
      }

      // ─── 余白（インチ換算: 10mm ≈ 0.394inch）──────────────────
      ws['!pageMargins'] = {
        left: 0.39,
        right: 0.39,
        top: 0.39,
        bottom: 0.39,
        header: 0.12,
        footer: 0.12,
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '個別支援計画書')

      XLSX.writeFile(wb, `個別支援計画書_${data.childName}_${data.planDate.replace(/[年月]/g, '').replace('日', '')}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={() => void handleExport()}
      disabled={exporting}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      <FileSpreadsheet className="h-4 w-4" />
      {exporting ? '出力中...' : 'Excelで出力'}
    </button>
  )
}
