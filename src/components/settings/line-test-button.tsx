'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

type TestResult = {
  ok?: boolean
  message?: string
  error?: string
  date?: string
  sent?: number
  failed?: number
  recipients?: string[]
  text?: string
}

export function LineTestButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const handleTest = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/test-line-notify', { method: 'POST' })
      const json = await res.json()
      setResult({ ...json, _status: res.status } as TestResult)
    } catch (e) {
      setResult({ error: String(e) })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleTest}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="h-4 w-4" />
        {loading ? '送信中...' : '今すぐLINE通知をテスト送信'}
      </button>

      {result && (
        <div className={`p-3 rounded-lg text-sm space-y-1 ${result.error || result.ok === false ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {result.error && (
            <p className="text-red-700 font-medium">エラー: {result.error}</p>
          )}
          {result.message && (
            <p className="text-gray-700">{result.message}</p>
          )}
          {result.ok && (
            <>
              <p className="text-green-700 font-medium">送信完了</p>
              <p className="text-gray-600">送信成功: {result.sent}件 / 失敗: {result.failed}件</p>
              {result.recipients && result.recipients.length > 0 && (
                <p className="text-gray-600">送信先: {result.recipients.join('、')}</p>
              )}
            </>
          )}
          {result.sent === 0 && result.recipients?.length === 0 && (
            <p className="text-yellow-700">⚠ LINE User IDが登録されているスタッフがいません。スタッフ管理でLINE User IDを設定してください。</p>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        ※ 毎日午後2時（JST）に自動送信されます。このボタンは即時テスト用です。<br />
        送信されない場合は、Vercelの環境変数（LINE_CHANNEL_ACCESS_TOKEN）とVercel Proプランを確認してください。
      </p>
    </div>
  )
}
