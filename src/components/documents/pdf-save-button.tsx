'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  /** PDFにするページ要素のCSSセレクタ（1要素 = A4の1枚） */
  pageSelector: string
  fileName: string
}

/**
 * 画面に出ている帳票（1要素 = 1枚）をそのままA4縦のPDFにして保存する。
 * 印刷ダイアログを経由せず、ワンクリックでファイルになる。
 */
export function PdfSaveButton({ pageSelector, fileName }: Props) {
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
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ])
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = 210
      const pageH = 297
      const margin = 10

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff' })
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
