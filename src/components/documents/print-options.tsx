'use client'

import { FileDown, Printer } from 'lucide-react'

export function PrintOptions() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      >
        <FileDown className="h-4 w-4" />
        PDFとして保存
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Printer className="h-4 w-4" />
        印刷する
      </button>
      <p className="text-xs text-gray-400 w-full">
        ※印刷ダイアログが開きます。送信先で「PDFに保存」を選ぶとPDFが作成されます。
      </p>
    </div>
  )
}
