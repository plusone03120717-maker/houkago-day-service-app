'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle, Calculator, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { saveUpperLimit, deleteUpperLimit, type UpperLimitOfficeInput } from '@/app/actions/upper-limit'

export type UpperLimitFormChild = {
  childId: string
  childName: string
  certificateNumber: string
  /** 受給者証の負担上限月額 */
  copayLimit: number
  /** 当月の当事業所ぶんの総費用額・利用者負担額（再集計の結果・上限額管理前） */
  selfTotalCost: number
  selfCopayAmount: number
  /** 受給者証・上限管理事業所情報から判定した、当事業所が管理事業所か */
  isSelf: boolean
  /** 他事業所が管理事業所のときの名称・番号 */
  managerName: string
  managerNumber: string
  conflict: string | null
  saved: {
    managerOfficeNumber: string
    isSelfManaged: boolean
    result: '1' | '2' | '3'
    copayLimit: number
    offices: UpperLimitOfficeInput[]
  } | null
}

const RESULT_OPTIONS: Array<{ value: '1' | '2' | '3'; label: string; short: string }> = [
  {
    value: '1',
    label: '1: 管理事業所で利用者負担額を充当したため、他事業所の利用者負担は発生しない',
    short: '1: 管理事業所で充当（当事業所は0円）',
  },
  {
    value: '2',
    label: '2: 利用者負担額の合算額が、負担上限月額以下のため、調整事務は行わない',
    short: '2: 上限月額以下のため調整なし',
  },
  {
    value: '3',
    label: '3: 利用者負担額の合算額が、負担上限月額を超過するため、下記のとおり調整した',
    short: '3: 上限月額を超えるため調整',
  },
]

const yen = (n: number) => `${n.toLocaleString()}円`

export function UpperLimitForm({
  child,
  yearMonth,
  facilityNumber,
  facilityName,
}: {
  child: UpperLimitFormChild
  yearMonth: string
  facilityNumber: string
  facilityName: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [isSelfManaged, setIsSelfManaged] = useState(child.saved?.isSelfManaged ?? child.isSelf)
  const [managerNumber, setManagerNumber] = useState(
    child.saved && !child.saved.isSelfManaged ? child.saved.managerOfficeNumber : child.managerNumber,
  )
  const [result, setResult] = useState<'1' | '2' | '3'>(child.saved?.result ?? '3')
  const [resultTouched, setResultTouched] = useState(child.saved != null)
  const [copayLimit, setCopayLimit] = useState(String(child.saved?.copayLimit ?? child.copayLimit))

  const selfRow = (managed: number): UpperLimitOfficeInput => ({
    lineNo: 1,
    officeNumber: facilityNumber,
    officeName: facilityName,
    totalCost: child.selfTotalCost,
    copayAmount: child.selfCopayAmount,
    managedCopayAmount: managed,
  })

  // ── 他事業所が管理事業所: 戻ってきた結果の額だけ入れる ──
  const savedSelfLine = child.saved?.offices.find((o) => o.officeNumber === facilityNumber) ?? null
  const [resultAmount, setResultAmount] = useState(
    child.saved && !child.saved.isSelfManaged && savedSelfLine ? String(savedSelfLine.managedCopayAmount) : '',
  )

  // ── 当事業所が管理事業所: 事業所ごとの内訳 ──
  const [offices, setOffices] = useState<UpperLimitOfficeInput[]>(
    child.saved?.isSelfManaged ? child.saved.offices : [selfRow(Math.min(child.selfCopayAmount, child.copayLimit))],
  )

  const setOffice = (i: number, patch: Partial<UpperLimitOfficeInput>) =>
    setOffices((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const addOffice = () =>
    setOffices((prev) => [
      ...prev,
      { lineNo: prev.length + 1, officeNumber: '', officeName: '', totalCost: 0, copayAmount: 0, managedCopayAmount: 0 },
    ])

  const removeOffice = (i: number) =>
    setOffices((prev) => prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, lineNo: idx + 1 })))

  const selfIdx = offices.findIndex((o) => o.officeNumber === facilityNumber)
  const selfStale =
    selfIdx >= 0 &&
    (offices[selfIdx].totalCost !== child.selfTotalCost || offices[selfIdx].copayAmount !== child.selfCopayAmount)

  /**
   * 管理結果と「管理結果後利用者負担額」を、入力済みの利用者負担額から計算する。
   * 管理事業所（当事業所）の負担額を先に充当し、残りの上限額を他事業所へ項番順に割り当てる。
   */
  const handleAutoCalc = () => {
    const limit = parseInt(copayLimit) || 0
    const copays = offices.map((o) => Number(o.copayAmount) || 0)
    const total = copays.reduce((a, b) => a + b, 0)

    if (total <= limit) {
      setResult('2')
      setOffices((prev) => prev.map((o, i) => ({ ...o, managedCopayAmount: copays[i] })))
      return
    }
    let remaining = limit
    const managed = copays.map(() => 0)
    if (selfIdx >= 0) {
      managed[selfIdx] = Math.min(copays[selfIdx], remaining)
      remaining -= managed[selfIdx]
    }
    copays.forEach((c, i) => {
      if (i === selfIdx) return
      managed[i] = Math.min(c, remaining)
      remaining -= managed[i]
    })
    setResult(selfIdx >= 0 && managed[selfIdx] >= limit ? '1' : '3')
    setOffices((prev) => prev.map((o, i) => ({ ...o, managedCopayAmount: managed[i] })))
  }

  const sum = (key: keyof Pick<UpperLimitOfficeInput, 'totalCost' | 'copayAmount' | 'managedCopayAmount'>) =>
    offices.reduce((s, o) => s + (Number(o[key]) || 0), 0)

  /** 結果の額から管理結果の番号を推測する（手で選び直したら以後は触らない） */
  const handleResultAmount = (value: string) => {
    setResultAmount(value)
    if (resultTouched || value === '') return
    const amount = parseInt(value) || 0
    if (amount === 0) setResult('1')
    else if (amount >= child.selfCopayAmount) setResult('2')
    else setResult('3')
  }

  const handleSave = async () => {
    setMessage('')
    setError('')
    if (!isSelfManaged && resultAmount.trim() === '') {
      setError('管理事業所から戻ってきた「管理結果後の利用者負担額」を入力してください')
      return
    }
    setSaving(true)
    const res = await saveUpperLimit({
      childId: child.childId,
      yearMonth,
      managerOfficeNumber: isSelfManaged ? facilityNumber : managerNumber.trim(),
      isSelfManaged,
      result,
      copayLimit: parseInt(copayLimit) || 0,
      offices: isSelfManaged
        ? offices.map((o) => ({
            ...o,
            officeNumber: o.officeNumber.trim(),
            totalCost: Number(o.totalCost) || 0,
            copayAmount: Number(o.copayAmount) || 0,
            managedCopayAmount: Number(o.managedCopayAmount) || 0,
          }))
        : [selfRow(parseInt(resultAmount) || 0)],
    })
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setMessage('保存しました。保護者への請求額と国保連請求に反映されます')
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm(`${child.childName}さんの${yearMonth.slice(4, 6)}月分の上限管理の入力を取り消しますか？`)) return
    setSaving(true)
    const res = await deleteUpperLimit(child.childId, yearMonth)
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setResultAmount('')
    setResultTouched(false)
    router.refresh()
  }

  const savedAmount = savedSelfLine?.managedCopayAmount ?? null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{child.childName}</p>
            {child.saved ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                入力済み{savedAmount != null ? `（負担額 ${yen(savedAmount)}）` : ''}
              </span>
            ) : (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                {isSelfManaged ? '未入力' : '結果待ち'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            受給者証 {child.certificateNumber} / 負担上限月額 {yen(child.copayLimit)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {child.saved && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving} title="入力を取り消す">
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {child.conflict && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {child.conflict}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isSelfManaged}
          onChange={(e) => setIsSelfManaged(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        当事業所（{facilityName}）が上限管理事業所
      </label>

      {!isSelfManaged ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">上限管理事業所</p>
              <p className="text-sm text-gray-900 h-9 flex items-center">{child.managerName || '（未登録）'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                事業所番号（10桁・国保連CSVに必要）
              </label>
              <Input
                value={managerNumber}
                onChange={(e) => setManagerNumber(e.target.value)}
                placeholder="結果票に書いてある番号"
                maxLength={10}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            当事業所の今月の実績（上限管理一覧表に載る額）: 総費用額 {yen(child.selfTotalCost)} / 利用者負担額{' '}
            <span className="font-semibold text-gray-900">{yen(child.selfCopayAmount)}</span>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-indigo-900">
              上限管理の結果（管理事業所から戻ってきた結果票を見て入力）
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  管理結果後の利用者負担額（当事業所分）
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={resultAmount}
                    onChange={(e) => handleResultAmount(e.target.value)}
                    min={0}
                    placeholder={String(child.selfCopayAmount)}
                    inputMode="numeric"
                  />
                  <span className="text-sm text-gray-500">円</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">管理結果</label>
                <select
                  value={result}
                  onChange={(e) => {
                    setResult(e.target.value as '1' | '2' | '3')
                    setResultTouched(true)
                  }}
                  className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  {RESULT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.short}</option>
                  ))}
                </select>
              </div>
            </div>
            {resultAmount.trim() !== '' && (
              <p className="text-xs text-indigo-800">
                保存すると、保護者への請求（利用者負担額）が {yen(child.selfCopayAmount)} →{' '}
                <span className="font-semibold">{yen(parseInt(resultAmount) || 0)}</span> になります
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">負担上限月額（円）</label>
              <Input
                type="number"
                value={copayLimit}
                onChange={(e) => setCopayLimit(e.target.value)}
                min={0}
                step={100}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">管理結果</label>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value as '1' | '2' | '3')}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                {RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.short}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">{RESULT_OPTIONS.find((o) => o.value === result)?.label}</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-gray-600">
                事業所ごとの内訳（他事業所の分は、届いた上限管理一覧表を見て入力）
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={handleAutoCalc}>
                  <Calculator className="h-3.5 w-3.5" />
                  管理結果を自動計算
                </Button>
                <Button variant="ghost" size="sm" onClick={addOffice}>
                  <Plus className="h-3.5 w-3.5" />
                  事業所を追加
                </Button>
              </div>
            </div>
            {selfStale && (
              <div className="flex items-center justify-between gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <span>
                  当事業所の行が最新の実績（総費用額 {yen(child.selfTotalCost)} / 負担額 {yen(child.selfCopayAmount)}）と違います
                </span>
                <button
                  type="button"
                  onClick={() => setOffice(selfIdx, { totalCost: child.selfTotalCost, copayAmount: child.selfCopayAmount })}
                  className="inline-flex items-center gap-1 font-medium hover:underline shrink-0"
                >
                  <RefreshCw className="h-3 w-3" />
                  最新にする
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-medium pb-1 w-8">項番</th>
                    <th className="text-left font-medium pb-1">事業所番号</th>
                    <th className="text-left font-medium pb-1">事業所名称</th>
                    <th className="text-left font-medium pb-1">総費用額</th>
                    <th className="text-left font-medium pb-1">利用者負担額</th>
                    <th className="text-left font-medium pb-1">管理結果後</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {offices.map((o, i) => (
                    <tr key={i}>
                      <td className="pr-1 text-gray-500">{o.lineNo}</td>
                      <td className="pr-1">
                        <Input
                          value={o.officeNumber}
                          onChange={(e) => setOffice(i, { officeNumber: e.target.value })}
                          maxLength={10}
                          className="h-8"
                        />
                      </td>
                      <td className="pr-1">
                        <Input
                          value={o.officeName}
                          onChange={(e) => setOffice(i, { officeName: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="pr-1">
                        <Input
                          type="number"
                          value={String(o.totalCost)}
                          onChange={(e) => setOffice(i, { totalCost: parseInt(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </td>
                      <td className="pr-1">
                        <Input
                          type="number"
                          value={String(o.copayAmount)}
                          onChange={(e) => setOffice(i, { copayAmount: parseInt(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </td>
                      <td className="pr-1">
                        <Input
                          type="number"
                          value={String(o.managedCopayAmount)}
                          onChange={(e) => setOffice(i, { managedCopayAmount: parseInt(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </td>
                      <td>
                        {offices.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOffice(i)}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-gray-700">
                    <td colSpan={3} className="pt-1 text-right pr-2">合計</td>
                    <td className="pt-1">{sum('totalCost').toLocaleString()}</td>
                    <td className="pt-1">{sum('copayAmount').toLocaleString()}</td>
                    <td className="pt-1">{sum('managedCopayAmount').toLocaleString()}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            {selfIdx < 0 && (
              <p className="text-xs text-red-600">
                当事業所（{facilityNumber}）の行がありません。当事業所の負担額が反映されません
              </p>
            )}
            {result === '3' && sum('managedCopayAmount') !== (parseInt(copayLimit) || 0) && (
              <p className="text-xs text-amber-600">
                管理結果3のときは「管理結果後」の合計が負担上限月額（{yen(parseInt(copayLimit) || 0)}）に
                なるはずです。現在 {yen(sum('managedCopayAmount'))}です。
              </p>
            )}
            {selfIdx >= 0 && (
              <p className="text-xs text-gray-500">
                当事業所の「管理結果後」{yen(Number(offices[selfIdx].managedCopayAmount) || 0)}が、保護者への請求額になります
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-green-600">{message}</p>}
    </div>
  )
}
