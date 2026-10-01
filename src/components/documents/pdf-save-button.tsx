'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  /** PDFにするページ要素のCSSセレクタ（1要素 = A4の1枚） */
  pageSelector: string
  fileName: string
  /** 用紙の向き。日付が横に31列並ぶ表などは横向き（landscape）にする */
  orientation?: 'portrait' | 'landscape'
}

/**
 * 画面に出ている帳票（1要素 = 1枚）をそのままA4のPDFにして保存する。
 * 印刷ダイアログを経由せず、ワンクリックでファイルになる。
 */
export function PdfSaveButton({ pageSelector, fileName, orientation = 'portrait' }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      const pages = Array.from(document.querySelectorAll<HTMLElement>(pageSelector))
      if (pages.length === 0) {
        setError('PDFにする帳票がありません')
        return
      }
      // 画面側で読み込み中の帳票があると、読み込み中の表示がそのままPDFに写ってしまう
      if (pages.some((p) => p.querySelector('.animate-spin'))) {
        setError('まだ読み込み中の表があります。表示が終わってからもう一度押してください')
        return
      }
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        // ブラウザ専用ビルドを直接読む。'jspdf' だとサーバー側の事前描画で Node 用ビルド
        // （fflate の worker_threads 版）が選ばれ、Vercel のビルドが失敗していた
        import('jspdf/dist/jspdf.es.min.js'),
      ])
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
      const pageW = orientation === 'landscape' ? 297 : 210
      const pageH = orientation === 'landscape' ? 210 : 297
      const margin = 10

      for (let i = 0; i < pages.length; i++) {
        // 画面幅より広い帳票も切れずに写るよう、描画時の画面幅を帳票の幅に合わせる
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          backgroundColor: '#ffffff',
          windowWidth: Math.max(window.innerWidth, pages[i].scrollWidth),
        })
        // 余白を除いた領域に、縦横比を保って収める
        const maxW = pageW - margin * 2
        const maxH = pageH - margin * 2
        const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
        const w = canvas.width * ratio
        const h = canvas.height * ratio
        if (i > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, w, h)
      }
      pdf.save(fileName)
    } catch (e) {
      setError(`PDFを作成できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleSave} disabled={loading} className="flex items-center gap-1.5">
        <FileDown className="h-4 w-4" />
        {loading ? 'PDF作成中...' : 'PDFで保存'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
