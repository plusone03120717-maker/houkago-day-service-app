'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Save, Trash2 } from 'lucide-react'
import { saveUpperLimit, deleteUpperLimit, type UpperLimitOfficeInput } from '@/app/actions/upper-limit'

export type UpperLimitFormChild = {
  childId: string
  childName: string
  certificateNumber: string
  /** 受給者証の負担上限月額 */
  copayLimit: number
  /** 当月の当事業所ぶんの総費用額・利用者負担額（再集計の結果） */
  selfTotalCost: number
  selfCopayAmount: number
  saved: {
    managerOfficeNumber: string
    isSelfManaged: boolean
    result: '1' | '2' | '3'
    copayLimit: number
    offices: UpperLimitOfficeInput[]
  } | null
}

const RESULT_OPTIONS: Array<{ value: '1' | '2' | '3'; label: string }> = [
  { value: '1', label: '1: 管理事業所で利用者負担額を充当したため、他事業所の利用者負担は発生しない' },
  { value: '2', label: '2: 利用者負担額の合算額が、負担上限月額以下のため、調整事務は行わない' },
  { value: '3', label: '3: 利用者負担額の合算額が、負担上限月額を超過するため、下記のとおり調整した' },
]

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

  const [isSelfManaged, setIsSelfManaged] = useState(child.saved?.isSelfManaged ?? false)
  const [managerNumber, setManagerNumber] = useState(
    child.saved?.managerOfficeNumber ?? (child.saved ? '' : facilityNumber),
  )
  const [result, setResult] = useState<'1' | '2' | '3'>(child.saved?.result ?? '3')
  const [copayLimit, setCopayLimit] = useState(String(child.saved?.copayLimit ?? child.copayLimit))
  const [offices, setOffices] = useState<UpperLimitOfficeInput[]>(
    child.saved?.offices ?? [
      {
        lineNo: 1,
        officeNumber: facilityNumber,
        officeName: facilityName,
        totalCost: child.selfTotalCost,
        copayAmount: child.selfCopayAmount,
        managedCopayAmount: 0,
      },
    ],
  )

  const setOffice = (i: number, patch: Partial<UpperLimitOfficeInput>) =>
    setOffices((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))

  const addOffice = () =>
    setOffices((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        officeNumber: '',
        officeName: '',
        totalCost: 0,
        copayAmount: 0,
        managedCopayAmount: 0,
      },
    ])

  const removeOffice = (i: number) =>
    setOffices((prev) => prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, lineNo: idx + 1 })))

  const sum = (key: keyof Pick<UpperLimitOfficeInput, 'totalCost' | 'copayAmount' | 'managedCopayAmount'>) =>
    offices.reduce((s, o) => s + (Number(o[key]) || 0), 0)

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    const res = await saveUpperLimit({
      childId: child.childId,
      yearMonth,
      managerOfficeNumber: managerNumber.trim(),
      isSelfManaged,
      result,
      copayLimit: parseInt(copayLimit) || 0,
      offices: isSelfManaged
        ? offices.map((o) => ({
            ...o,
            totalCost: Number(o.totalCost) || 0,
            copayAmount: Number(o.copayAmount) || 0,
            managedCopayAmount: Number(o.managedCopayAmount) || 0,
          }))
        : offices
            .filter((o) => o.officeNumber === facilityNumber)
            .map((o) => ({
              ...o,
              totalCost: Number(o.totalCost) || 0,
              copayAmount: Number(o.copayAmount) || 0,
              managedCopayAmount: Number(o.managedCopayAmount) || 0,
            })),
    })
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setMessage('保存しました')
    router.refresh()
  }

  const handleDelete = async () => {
    setSaving(true)
    const res = await deleteUpperLimit(child.childId, yearMonth)
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{child.childName}</p>
          <p className="text-xs text-gray-500">
            受給者証 {child.certificateNumber} / 負担上限月額 {child.copayLimit.toLocaleString()}円
          </p>
        </div>
        <div className="flex items-center gap-2">
          {child.saved && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isSelfManaged}
          onChange={(e) => {
            setIsSelfManaged(e.target.checked)
            if (e.target.checked) setManagerNumber(facilityNumber)
          }}
          className="h-4 w-4 rounded border-gray-300"
        />
        当事業所が上限額管理事業所
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">上限額管理事業所番号</label>
          <Input
            value={managerNumber}
            onChange={(e) => setManagerNumber(e.target.value)}
            placeholder="1951200672"
            maxLength={10}
            disabled={isSelfManaged}
          />
        </div>
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
            className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
          >
            {RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-400">{RESULT_OPTIONS.find((o) => o.value === result)?.label}</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600">
            事業所ごとの内訳{isSelfManaged ? '' : '（当事業所ぶんのみ入力すれば足ります）'}
          </p>
          {isSelfManaged && (
            <Button variant="ghost" size="sm" onClick={addOffice}>
              <Plus className="h-3.5 w-3.5" />
              事業所を追加
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
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
        {result === '3' && sum('managedCopayAmount') !== (parseInt(copayLimit) || 0) && (
          <p className="text-xs text-amber-600">
            管理結果3のときは「管理結果後」の合計が負担上限月額（{(parseInt(copayLimit) || 0).toLocaleString()}円）に
            なるはずです。現在 {sum('managedCopayAmount').toLocaleString()}円です。
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-green-600">{message}</p>}
    </div>
  )
}
