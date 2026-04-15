'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface NotableRecord {
  date: string
  content: string
}

interface Props {
  records: NotableRecord[]
}

export function NotableRecordsSummary({ records }: Props) {
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const handleSummarize = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/daily-records/summarize-notable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const data = await res.json()
      if (data.summary) setSummary(data.summary)
    } finally {
      setGenerating(false)
    }
  }

  if (records.length === 0) return null

  return (
    <Card className="border-orange-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            特記事項まとめ
            <span className="text-xs font-normal text-gray-400">（直近3ヶ月・{records.length}件）</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSummarize}
              disabled={generating}
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <Bot className="h-3.5 w-3.5" />
              {generating ? 'AI要約中...' : 'AI要約'}
            </Button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-gray-100"
            >
              {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {/* AI要約結果 */}
          {summary && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs font-medium text-orange-700 mb-1.5 flex items-center gap-1">
                <Bot className="h-3 w-3" />
                AI要約（モニタリング議題候補）
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{summary}</p>
            </div>
          )}

          {/* 特記事項一覧 */}
          <div className="divide-y divide-gray-100">
            {records.map((rec, i) => (
              <div key={i} className="py-2.5 flex gap-3">
                <span className="text-xs text-gray-400 whitespace-nowrap pt-0.5 w-20 flex-shrink-0">
                  {formatDate(rec.date, 'MM/dd')}
                </span>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{rec.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
