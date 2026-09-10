'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Copy, Check, KeyRound, AlertTriangle } from 'lucide-react'
import { SERVICE_MANAGER } from '@/lib/roles'

// 役職オプション（needsAuth=trueはアプリログイン・電話番号が必要）
// サービス管理者はログイン権限としてはスタッフと同じで、
// 追加で「児童管理 → 利用スケジュール」を編集できる。
const ROLE_OPTIONS = [
  { value: 'staff',           label: 'スタッフ',       needsAuth: true },
  { value: SERVICE_MANAGER,   label: 'サービス管理者',  needsAuth: true },
  { value: 'admin',           label: 'システム管理者',  needsAuth: true },
  { value: 'driver',          label: 'ドライバー',      needsAuth: false },
  { value: 'therapist',       label: '療育士',         needsAuth: false },
]

function getAuthRole(selected: Set<string>): 'admin' | 'staff' | null {
  if (selected.has('admin')) return 'admin'
  if (selected.has('staff') || selected.has(SERVICE_MANAGER)) return 'staff'
  return null
}

type InviteResult = {
  isExisting: boolean
  phone: string
  tempPassword: string
  overwrittenName: string | null
}

export function StaffInviteForm() {
  const supabase = createClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(['staff']))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // 同じ電話番号の既存スタッフがいたときに、上書きするか確認するための名前
  const [conflictName, setConflictName] = useState('')
  const [result, setResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const authRole = getAuthRole(selectedRoles)
  const needsPhone = authRole !== null

  const toggleRole = (value: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setError('')
    setConflictName('')
    setResult(null)
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submitInvite = async (overwrite: boolean) => {
    const nonAuthRoles = [...selectedRoles].filter((r) => !['admin', 'staff'].includes(r))
    setLoading(true)
    setError('')
    setConflictName('')
    setResult(null)

    const res = await fetch('/api/staff/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim(),
        name: name.trim(),
        role: authRole,
        jobTitles: nonAuthRoles,
        overwrite,
      }),
    })
    setLoading(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? '登録に失敗しました')
      if (json.conflictName) setConflictName(json.conflictName)
      return
    }
    setResult({
      isExisting: json.isExisting,
      phone: json.phone,
      tempPassword: json.tempPassword,
      overwrittenName: json.overwrittenName ?? null,
    })
    setPhone('')
    setName('')
    setSelectedRoles(new Set(['staff']))
  }

  const handleSubmit = async (ev: React.BaseSyntheticEvent) => {
    ev.preventDefault()
    if (!name.trim() || selectedRoles.size === 0) return

    if (needsPhone) {
      if (!phone.trim()) {
        setError('電話番号を入力してください')
        return
      }
      await submitInvite(false)
    } else {
      setLoading(true)
      setError('')
      setConflictName('')
      setResult(null)
      // ログイン不要 → staff_members に登録
      const { error: err } = await supabase
        .from('staff_members')
        .insert({
          name: name.trim(),
          role: [...selectedRoles][0] ?? 'driver',
          roles: [...selectedRoles],
        })
      setLoading(false)
      if (err) {
        setError('登録に失敗しました: ' + err.message)
      } else {
        setResult({ isExisting: false, phone: '', tempPassword: '', overwrittenName: null })
        setName('')
        setSelectedRoles(new Set(['driver']))
        window.location.reload()
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          スタッフを追加
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                氏名 <span className="text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); setConflictName('') }}
                placeholder="山田 太郎"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                電話番号
                {needsPhone
                  ? <span className="text-red-500 ml-0.5">*</span>
                  : <span className="ml-1 text-gray-400 font-normal">（ドライバー等ログイン不要）</span>
                }
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(''); setConflictName('') }}
                placeholder="090-1234-5678"
                disabled={!needsPhone}
                required={needsPhone}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">
              役職
              <span className="ml-1 text-gray-400 font-normal">（複数選択可）</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleRole(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedRoles.has(opt.value)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {selectedRoles.has(SERVICE_MANAGER) && (
              <p className="text-xs text-violet-600 mt-1.5">
                サービス管理者は、スタッフの権限に加えて「児童管理 → 利用スケジュール」を編集できます。
              </p>
            )}
            {!needsPhone && selectedRoles.size > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                ログイン不要のスタッフとして登録されます。LINE User IDを設定すると、LINEからマイスケジュールの確認や各種申請ができます。
              </p>
            )}
            {needsPhone && (
              <p className="text-xs text-gray-400 mt-1.5">
                仮パスワードを発行します。スタッフに電話番号と仮パスワードをお伝えください。
              </p>
            )}
          </div>

          {error && !conflictName && <p className="text-sm text-red-600">{error}</p>}

          {/* 同じ電話番号の既存スタッフがいる場合の確認 */}
          {conflictName && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                この電話番号は使用済みです
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                「{conflictName}」さんが同じ電話番号で登録されています。
                このまま登録すると<strong>「{conflictName}」さんのアカウントが「{name.trim()}」さんに置き換わり、
                {conflictName}さんはスタッフ一覧から消えます</strong>。
                別人の場合は、電話番号を確認して入力し直してください。
              </p>
              <p className="text-xs text-amber-700">
                改姓などで同じ人の名前を変更したい場合のみ、下のボタンで続行してください。
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setConflictName(''); setError('') }}
                  className="border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  電話番号を入力し直す
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={() => submitInvite(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {loading ? '処理中...' : `「${conflictName}」さんを上書きする`}
                </Button>
              </div>
            </div>
          )}

          {/* 登録結果 */}
          {result && (
            result.tempPassword ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-700">
                  <KeyRound className="h-4 w-4" />
                  {result.isExisting ? 'パスワードをリセットしました' : 'スタッフを登録しました'}
                </div>
                <p className="text-xs text-indigo-600">
                  {result.overwrittenName
                    ? `「${result.overwrittenName}」さんのアカウントを上書きしました。「${result.overwrittenName}」さんはスタッフ一覧から消えています。`
                    : result.isExisting
                      ? '登録済みの電話番号です。情報を更新し新しい仮パスワードを発行しました。以下をスタッフにお伝えください。'
                      : '以下のログイン情報をスタッフにお伝えください。初回ログイン後にパスワードの変更が求められます。'
                  }
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0">電話番号</span>
                    <span className="text-sm font-mono text-gray-800 flex-1">{result.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0">仮パスワード</span>
                    <span className="text-sm font-mono font-bold text-gray-900 flex-1 tracking-widest">{result.tempPassword}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(`電話番号: ${result.phone}\n仮パスワード: ${result.tempPassword}`)}
                      className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'コピー済' : 'コピー'}
                    </Button>
                  </div>
                </div>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    確認しました
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-600">登録しました。</p>
            )
          )}

          <Button type="submit" disabled={loading || !name.trim() || selectedRoles.size === 0} size="sm">
            {loading ? '処理中...' : needsPhone ? '登録して仮パスワードを発行' : '登録する'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
