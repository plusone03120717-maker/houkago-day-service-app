'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Umbrella, Coffee, CheckCircle } from 'lucide-react'

export type OvertimeRequest = {
  id: string
  date: string
  actual_end_time: string | null
  overtime_minutes: number | null
  status: string
  staff_members: { name: string } | null
}

export type LeaveUsage = {
  id: string
  date: string
  days_used: number
  staff_members: { name: string } | null
}

export type BreakRecord = {
  id: string
  recorded_at: string
  staff_members: { name: string } | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function formatDateTime(isoStr: string) {
  const jst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  const m = jst.getUTCMonth() + 1
  const day = jst.getUTCDate()
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${jst.getUTCFullYear()}年${m}月${day}日 ${hh}:${mm}`
}

interface Props {
  overtimeRequests: OvertimeRequest[]
  leaveUsages: LeaveUsage[]
  breakRecords: BreakRecord[]
}

export function StaffRequestsBoard({ overtimeRequests: init_ot, leaveUsages: init_lv, breakRecords: init_br }: Props) {
  const [overtimes, setOvertimes] = useState(init_ot)
  const [leaves, setLeaves] = useState(init_lv)
  const [breaks, setBreaks] = useState(init_br)
  const [loading, setLoading] = useState<string | null>(null)

  const handleOvertimeReviewed = async (id: string) => {
    setLoading(id)
    await fetch('/api/staff-requests/overtime-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setOvertimes((prev) => prev.filter((r) => r.id !== id))
    setLoading(null)
  }

  const handleLeaveReviewed = async (id: string) => {
    setLoading(id)
    await fetch('/api/staff-requests/leave-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setLeaves((prev) => prev.filter((r) => r.id !== id))
    setLoading(null)
  }

  // 有給申請の取り消し（レコードごと削除）
  const handleLeaveCancel = async (id: string) => {
    if (!window.confirm('この有給申請を取り消します。記録も削除されますが、よろしいですか？')) return
    setLoading(id)
    try {
      const res = await fetch(`/api/staff/paid-leave/usage?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        alert(j.error ?? '取り消しに失敗しました')
        return
      }
      setLeaves((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setLoading(null)
    }
  }

  const handleBreakReviewed = async (id: string) => {
    setLoading(id)
    await fetch('/api/staff-requests/break-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBreaks((prev) => prev.filter((r) => r.id !== id))
    setLoading(null)
  }

  const total = overtimes.length + leaves.length + breaks.length

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <CheckCircle className="h-12 w-12 mb-3 text-green-400" />
        <p className="text-sm">未確認の申請はありません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 残業申請 */}
      {overtimes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-orange-500" />
              残業申請
              <Badge variant="secondary">{overtimes.length}件</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overtimes.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{req.staff_members?.name ?? '—'}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(req.date)}
                    {req.actual_end_time ? ` 終了 ${req.actual_end_time.slice(0, 5)}` : ''}
                    {req.overtime_minutes ? `　残業 ${req.overtime_minutes}分` : ''}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">自動承認済み</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading === req.id}
                  onClick={() => handleOvertimeReviewed(req.id)}
                >
                  確認済み
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 有給申請 */}
      {leaves.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Umbrella className="h-4 w-4 text-blue-500" />
              有給申請
              <Badge variant="secondary">{leaves.length}件</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leaves.map((lv) => (
              <div key={lv.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{lv.staff_members?.name ?? '—'}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(lv.date)}　{lv.days_used === 0.5 ? '半日' : '1日'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === lv.id}
                    onClick={() => handleLeaveReviewed(lv.id)}
                  >
                    確認済み
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === lv.id}
                    onClick={() => handleLeaveCancel(lv.id)}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    取り消し
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 中抜け申請 */}
      {breaks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coffee className="h-4 w-4 text-purple-500" />
              中抜け申請
              <Badge variant="secondary">{breaks.length}件</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {breaks.map((br) => (
              <div key={br.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{br.staff_members?.name ?? '—'}</p>
                  <p className="text-sm text-gray-500">{formatDateTime(br.recorded_at)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading === br.id}
                  onClick={() => handleBreakReviewed(br.id)}
                >
                  確認済み
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
