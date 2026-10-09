'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Users, Loader2, Check, X, Plus, Search } from 'lucide-react'

type Candidate = {
  id: string
  name: string
  birth_date: string
  birthMatch: boolean
  nameMatch: boolean
}

type RequestRow = {
  id: string
  line_display_name: string | null
  child_name_kana: string
  birth_date: string
  created_at: string
  candidates: Candidate[]
}

type GuardianRow = {
  id: string
  name: string | null
  created_at: string
  children: { id: string; name: string }[]
}

type Child = { id: string; name: string; birth_date: string }

type Props = {
  requests: RequestRow[]
  guardians: GuardianRow[]
  childList: Child[]
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${y}/${m}/${d}`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function post(body: object): Promise<string | null> {
  const res = await fetch('/api/guardian-registrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return null
  const json = await res.json().catch(() => ({})) as { error?: string }
  return json.error ?? 'エラーが発生しました'
}

/** 児童を1人選んで追加するセレクト。同名の児童を見分けられるよう生年月日も出す */
function ChildPicker({
  childList,
  exclude,
  label,
  disabled,
  onPick,
}: {
  childList: Child[]
  exclude: string[]
  label: string
  disabled?: boolean
  onPick: (childId: string) => void
}) {
  const options = childList.filter((c) => !exclude.includes(c.id))
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => { if (e.target.value) onPick(e.target.value) }}
      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
    >
      <option value="">{label}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}（{formatDate(c.birth_date)}）
        </option>
      ))}
    </select>
  )
}

function RequestCard({ request, childList }: { request: RequestRow; childList: Child[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // 生年月日と名前の両方が合う候補が1人だけなら、最初から選んでおく
  const strong = request.candidates.filter((c) => c.birthMatch && c.nameMatch)
  const [selected, setSelected] = useState<string[]>(strong.length === 1 ? [strong[0].id] : [])
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const childById = new Map(childList.map((c) => [c.id, c]))
  const candidateIds = request.candidates.map((c) => c.id)
  // 候補に無い児童を選んだ場合も、選択中として見えるようにする
  const extra = selected.filter((id) => !candidateIds.includes(id))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function act(action: 'approve' | 'reject') {
    setBusy(action)
    setError(null)
    const err = await post(
      action === 'approve'
        ? { action, requestId: request.id, childIds: selected }
        : { action, requestId: request.id }
    )
    setBusy(null)
    if (err) {
      setError(err)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {request.child_name_kana}
            <span className="ml-2 font-normal text-gray-600">{formatDate(request.birth_date)} 生まれ</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            LINEの名前：{request.line_display_name ?? '（不明）'} ・ {formatDateTime(request.created_at)} 申請
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600 mb-1.5">紐付ける児童（ごきょうだいは複数選べます）</p>
        {request.candidates.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">
            名前・生年月日が合う児童が見つかりませんでした。下の「児童を選ぶ」から選んでください。
          </p>
        )}
        <div className="space-y-1">
          {request.candidates.map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                selected.includes(c.id) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="font-medium text-gray-900">{c.name}</span>
              <span className="text-xs text-gray-500">{formatDate(c.birth_date)}</span>
              <span className="ml-auto flex gap-1">
                {c.birthMatch && (
                  <span className="text-[10px] rounded-full bg-green-100 text-green-700 px-2 py-0.5">生年月日が一致</span>
                )}
                {c.nameMatch && (
                  <span className="text-[10px] rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">名前が一致</span>
                )}
              </span>
            </label>
          ))}
          {extra.map((id) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-lg border border-indigo-400 bg-indigo-50 px-3 py-2 text-sm"
            >
              <Check className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-gray-900">{childById.get(id)?.name ?? '不明'}</span>
              <span className="text-xs text-gray-500">
                {childById.get(id) && formatDate(childById.get(id)!.birth_date)}
              </span>
              <button
                onClick={() => toggle(id)}
                className="ml-auto p-1 rounded text-gray-400 hover:text-gray-700"
                title="外す"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <ChildPicker
            childList={childList}
            exclude={[...candidateIds, ...selected]}
            label="＋ 児童を選ぶ"
            disabled={busy !== null}
            onPick={(id) => setSelected((prev) => [...prev, id])}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {confirmReject ? (
          <>
            <span className="text-xs text-red-600 mr-auto">この申請を却下します。保護者は申請し直せます。</span>
            <button
              onClick={() => act('reject')}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'reject' && <Loader2 className="h-3 w-3 animate-spin" />}
              却下する
            </button>
            <button
              onClick={() => setConfirmReject(false)}
              disabled={busy !== null}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              やめる
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmReject(true)}
              disabled={busy !== null}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              却下
            </button>
            <button
              onClick={() => act('approve')}
              disabled={busy !== null || selected.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {selected.length > 1 ? `${selected.length}人を承認` : '承認'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function GuardianCard({ guardian, childList }: { guardian: GuardianRow; childList: Child[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'link' | 'unlink', childId: string) {
    setBusy(childId)
    setError(null)
    const err = await post({ action, guardianId: guardian.id, childId })
    setBusy(null)
    setConfirmUnlink(null)
    if (err) {
      setError(err)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-gray-900">
          {guardian.name ?? '（LINEの名前なし）'}
          <span className="ml-2 text-xs font-normal text-gray-400">{formatDate(guardian.created_at)} 登録</span>
        </p>
        <ChildPicker
          childList={childList}
          exclude={guardian.children.map((c) => c.id)}
          label="＋ きょうだいを追加"
          disabled={busy !== null}
          onPick={(id) => act('link', id)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {guardian.children.length === 0 && (
          <span className="text-xs text-gray-400">紐付いている児童はいません</span>
        )}
        {guardian.children.map((c) =>
          confirmUnlink === c.id ? (
            <span key={c.id} className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-xs">
              <span className="text-red-700">{c.name} を外す？</span>
              <button
                onClick={() => act('unlink', c.id)}
                disabled={busy !== null}
                className="font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                {busy === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '外す'}
              </button>
              <button onClick={() => setConfirmUnlink(null)} className="text-gray-500 hover:underline">
                やめる
              </button>
            </span>
          ) : (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-800 px-2.5 py-1 text-xs"
            >
              {c.name}
              <button
                onClick={() => setConfirmUnlink(c.id)}
                disabled={busy !== null}
                className="text-indigo-300 hover:text-red-500"
                title="この児童との紐付けを外す"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        )}
        {busy && confirmUnlink === null && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function LineRegistrationsManager({ requests, guardians, childList }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const shownGuardians = q
    ? guardians.filter(
        (g) => (g.name ?? '').includes(q) || g.children.some((c) => c.name.includes(q))
      )
    : guardians

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">保護者のLINE登録</h1>
        <p className="text-sm text-gray-500 mt-1">
          保護者がLINEから送った登録の申請を承認します。登録済みの保護者には、ごきょうだいをここから追加できます。
          登録コードで登録する場合は<Link href="/settings/registration-codes" className="text-indigo-600 underline">登録コード発行</Link>から。
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <UserPlus className="h-5 w-5 text-indigo-500" />
          登録の申請
          {requests.length > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{requests.length}</span>
          )}
        </h2>
        {requests.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-gray-400 border border-gray-100 text-sm">
            承認待ちの申請はありません
          </div>
        ) : (
          requests.map((r) => <RequestCard key={r.id} request={r} childList={childList} />)
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <Users className="h-5 w-5 text-indigo-500" />
            登録済みの保護者
            <span className="text-sm font-normal text-gray-500">{guardians.length}人</span>
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="保護者名・児童名で検索"
              className="rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        {shownGuardians.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-gray-400 border border-gray-100 text-sm">
            {q ? '該当する保護者はいません' : 'LINEで登録した保護者はまだいません'}
          </div>
        ) : (
          shownGuardians.map((g) => <GuardianCard key={g.id} guardian={g} childList={childList} />)
        )}
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Plus className="h-3 w-3" />
          追加した児童は、保護者のLINE・保護者ポータルの両方にすぐ表示されます。
        </p>
      </section>
    </div>
  )
}
