'use client'

import { useEffect, useState } from 'react'
import { Loader2, User } from 'lucide-react'
import type { DayUser } from '@/lib/day-users'
import { DayUsersList } from '@/components/schedule/day-users-list'

/**
 * スタッフ LINE で、ある日の利用者（来る子）を出す欄。「自分」の1日の画面と「会議・予定」のカレンダーで共通。
 * 送迎や予定がない日でも出す（2026-11-20 依頼主）。顔ぶれはダッシュボード・出席管理と同じ（/api/liff/staff/schedule/day-users）。
 */

type Result =
  | { key: string; kind: 'ok'; users: DayUser[]; absent: DayUser[] }
  | { key: string; kind: 'error' }

export function DayUsersSection({ accessToken, date, reloadKey }: { accessToken: string; date: string; reloadKey: number }) {
  const [result, setResult] = useState<Result | null>(null)
  const key = `${date}#${reloadKey}`
  const loading = result?.key !== key

  useEffect(() => {
    let cancelled = false
    fetch('/api/liff/staff/schedule/day-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, date }),
    })
      .then(async (r) => {
        const json = await r.json() as { users?: DayUser[]; absent?: DayUser[] }
        if (cancelled) return
        setResult(r.ok ? { key, kind: 'ok', users: json.users ?? [], absent: json.absent ?? [] } : { key, kind: 'error' })
      })
      .catch(() => {
        if (!cancelled) setResult({ key, kind: 'error' })
      })
    return () => { cancelled = true }
  }, [accessToken, date, key])

  // 別の日を読みこんでいる間は、前の日の一覧を出さない
  const sameDay = result?.key.split('#')[0] === date

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2 px-1">
        <User className="h-3.5 w-3.5" />
        この日の利用者
        {result?.kind === 'ok' && !loading && <span className="text-indigo-600">{result.users.length}名</span>}
      </p>
      <div className={`bg-white rounded-2xl shadow-sm px-3 py-3 transition-opacity ${loading && sameDay ? 'opacity-60' : ''}`}>
        {!result || !sameDay ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          </div>
        ) : result.kind === 'error' ? (
          <p className="text-sm text-red-500 text-center py-2">利用者を取得できませんでした</p>
        ) : (
          <DayUsersList users={result.users} absent={result.absent} variant="liff" />
        )}
      </div>
    </div>
  )
}
