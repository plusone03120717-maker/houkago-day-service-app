'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle, Calculator, Check, FileText, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { saveUpperLimit, deleteUpperLimit, type UpperLimitOfficeInput } from '@/app/actions/upper-limit'
import { projectSelfCost, type SelfCostProjection } from '@/lib/billing/units'
import type { FaxDraft } from '@/lib/billing/fax-drafts'

export type UpperLimitFormChild = {
  childId: string
  childName: string
  certificateNumber: string
  /** 受給者証の負担上限月額 */
  copayLimit: number
  /** 当月の当事業所ぶんの総費用額・利用者負担額（再集計の結果・上限額管理前） */
  selfTotalCost: number
  selfCopayAmount: number
  /**
   * 利用者負担上限額管理加算を付けた／外したときの当事業所の総費用額を計算する材料。
   * 加算は保存後に請求明細へ付くので、保存前でも加算込みの見込み額を出すために使う
   */
  selfProjection: SelfCostProjection | null
  /** 受給者証・上限管理事業所情報から判定した、当事業所が管理事業所か */
  isSelf: boolean
  /** 他事業所が管理事業所のときの名称・番号 */
  managerName: string
  managerNumber: string
  conflict: string | null
  /** 今月の入力がないとき、前に入力した月の内容（事業所の引き継ぎ用） */
  previous: {
    yearMonth: string
    isSelfManaged: boolean
    managerOfficeNumber: string
    offices: UpperLimitOfficeInput[]
  } | null
  saved: {
    managerOfficeNumber: string
    isSelfManaged: boolean
    result: '1' | '2' | '3'
    copayLimit: number
    offices: UpperLimitOfficeInput[]
  } | null
  /** 月初の FAX チェックが読み取った FAX（下書き）。まだ保存していなければ入力欄へ先に入れる */
  faxDraft: FaxDraft | null
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

const digits = (s: string) => s.replace(/\D/g, '')

const receivedLabel = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 管理結果と「管理結果後利用者負担額」を、利用者負担額から計算する。
 * 管理事業所（当事業所）の負担額を先に充当し、残りの上限額を他事業所へ項番順に割り当てる。
 */
function calcManaged(copays: number[], limit: number, selfIdx: number): { result: '1' | '2' | '3'; managed: number[] } {
  const total = copays.reduce((a, b) => a + b, 0)
  if (total <= limit) return { result: '2', managed: [...copays] }
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
  return { result: selfIdx >= 0 && managed[selfIdx] >= limit ? '1' : '3', managed }
}

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
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [isSelfManaged, setIsSelfManaged] = useState(child.saved?.isSelfManaged ?? child.isSelf)

  // ── FAX の読み取り（下書き）。保存前だけ入力欄へ先に入れ、職員が「この内容で確定」で保存する ──
  const resultDraft =
    !child.saved && child.faxDraft?.result && child.faxDraft.result.managedCopayAmount != null
      ? child.faxDraft.result
      : null
  const copayDrafts = child.saved
    ? []
    : (child.faxDraft?.copayLists ?? []).filter((d) => digits(d.officeNumber) !== facilityNumber)

  const [managerNumber, setManagerNumber] = useState(
    child.saved && !child.saved.isSelfManaged
      ? child.saved.managerOfficeNumber
      : child.managerNumber ||
          resultDraft?.officeNumber ||
          (child.previous && !child.previous.isSelfManaged ? child.previous.managerOfficeNumber : ''),
  )
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
    child.saved && !child.saved.isSelfManaged && savedSelfLine
      ? String(savedSelfLine.managedCopayAmount)
      : resultDraft
        ? String(resultDraft.managedCopayAmount)
        : '',
  )
  // FAX から入れた額を職員が書き換えたら、「FAX から」の色を外す
  const [resultAmountFromFax, setResultAmountFromFax] = useState(resultDraft != null)

  // ── 当事業所が管理事業所: 事業所ごとの内訳 ──
  // 前の月に調整した他事業所は、番号・名称だけ引き継ぐ（金額は毎月届く一覧表を見て入れ直す）
  const carriedOffices = child.saved
    ? []
    : (child.previous?.isSelfManaged ? child.previous.offices : []).filter((o) => o.officeNumber !== facilityNumber)
  const buildInitialOffices = (): UpperLimitOfficeInput[] => {
    if (child.saved?.isSelfManaged) return child.saved.offices
    let rows: UpperLimitOfficeInput[] = [
      selfRow(Math.min(child.selfCopayAmount, child.copayLimit)),
      ...carriedOffices.map((o, i) => ({
        lineNo: i + 2,
        officeNumber: o.officeNumber,
        officeName: o.officeName,
        totalCost: 0,
        copayAmount: 0,
        managedCopayAmount: 0,
      })),
    ]
    if (copayDrafts.length === 0) return rows
    // 届いた一覧表の金額を、引き継いだ事業所の行へ入れる（ない事業所は行を足す）
    for (const d of copayDrafts) {
      const i = rows.findIndex(
        (r, idx) =>
          idx > 0 &&
          (d.officeNumber
            ? digits(r.officeNumber) === digits(d.officeNumber)
            : d.officeName !== '' && r.officeName === d.officeName),
      )
      const patch = { totalCost: d.totalCost ?? 0, copayAmount: d.copayAmount ?? 0 }
      rows =
        i >= 0
          ? rows.map((r, idx) => (idx === i ? { ...r, ...patch, officeName: r.officeName || d.officeName } : r))
          : [
              ...rows,
              { lineNo: rows.length + 1, officeNumber: d.officeNumber, officeName: d.officeName, managedCopayAmount: 0, ...patch },
            ]
    }
    // 他事業所の総費用額が入ると上限額管理加算が付くので、当事業所の行も加算込みの見込み額にする
    if (child.selfProjection && rows.some((r, idx) => idx > 0 && r.totalCost > 0)) {
      const p = projectSelfCost(child.selfProjection, true, child.copayLimit)
      rows = rows.map((r, idx) => (idx === 0 ? { ...r, totalCost: p.totalCost, copayAmount: p.copayAmount } : r))
    }
    const { managed } = calcManaged(rows.map((r) => r.copayAmount), child.copayLimit, 0)
    return rows.map((r, i) => ({ ...r, managedCopayAmount: managed[i] }))
  }
  const [offices, setOffices] = useState<UpperLimitOfficeInput[]>(buildInitialOffices)

  const [result, setResult] = useState<'1' | '2' | '3'>(() => {
    if (child.saved) return child.saved.result
    if (isSelfManaged && copayDrafts.length > 0) {
      const rows = buildInitialOffices()
      return calcManaged(rows.map((r) => r.copayAmount), child.copayLimit, 0).result
    }
    if (!isSelfManaged && resultDraft?.result) return resultDraft.result
    return '3'
  })
  const [resultTouched, setResultTouched] = useState(
    child.saved != null || resultDraft?.result != null || (isSelfManaged && copayDrafts.length > 0),
  )

  // FAX から金額を入れた事業所（行に「FAX」の印を付ける）
  const faxOfficeKeys = new Set(copayDrafts.map((d) => digits(d.officeNumber) || d.officeName))
  const isFaxRow = (o: UpperLimitOfficeInput) => faxOfficeKeys.has(digits(o.officeNumber) || o.officeName)
  // 引き継いだのに、まだ一覧表の FAX が届いていない事業所
  const waitingFaxOffices =
    copayDrafts.length > 0
      ? carriedOffices.filter((o) => !faxOfficeKeys.has(digits(o.officeNumber) || o.officeName))
      : []
  // 画面に出す「FAX から入れた」の知らせ（保存前だけ）
  const usingFax = !child.saved && (isSelfManaged ? copayDrafts.length > 0 : resultDraft != null)
  const faxSources = isSelfManaged
    ? copayDrafts.map((d) => `${d.officeName || d.officeNumber}（${receivedLabel(d.receivedAt)} 受信）`)
    : resultDraft
      ? [`${resultDraft.officeName || resultDraft.officeNumber}（${receivedLabel(resultDraft.receivedAt)} 受信）`]
      : []

  // 保存済みの額が、FAX の読み取りと違うとき（訂正の FAX が届いた・入力違いなど）
  const savedFaxMismatch: string[] = []
  if (child.saved && child.faxDraft) {
    const savedSelf = child.saved.offices.find((o) => o.officeNumber === facilityNumber)
    const r = child.faxDraft.result
    if (!child.saved.isSelfManaged && r?.managedCopayAmount != null && savedSelf && savedSelf.managedCopayAmount !== r.managedCopayAmount) {
      savedFaxMismatch.push(`結果票の負担額 ${yen(r.managedCopayAmount)}（保存は ${yen(savedSelf.managedCopayAmount)}）`)
    }
    if (child.saved.isSelfManaged) {
      for (const d of child.faxDraft.copayLists) {
        const o = child.saved.offices.find((x) =>
          d.officeNumber ? digits(x.officeNumber) === digits(d.officeNumber) : x.officeName === d.officeName,
        )
        if (!o) savedFaxMismatch.push(`${d.officeName || d.officeNumber}の行がありません`)
        else if ((d.totalCost != null && o.totalCost !== d.totalCost) || (d.copayAmount != null && o.copayAmount !== d.copayAmount)) {
          savedFaxMismatch.push(
            `${d.officeName || d.officeNumber}：FAX は総費用額 ${yen(d.totalCost ?? 0)}・負担額 ${yen(d.copayAmount ?? 0)}`,
          )
        }
      }
    }
  }

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
  // 他事業所に総費用額が入っていれば、保存時に利用者負担上限額管理加算（150単位）が付く。
  // 加算は処遇改善加算の計算にも入るので、当事業所の総費用額は加算込みで見る
  const withAddition = offices.some(
    (o) => o.officeNumber.trim() !== facilityNumber && (Number(o.totalCost) || 0) > 0,
  )
  const expectedSelf = child.selfProjection
    ? projectSelfCost(child.selfProjection, withAddition, child.copayLimit)
    : { totalCost: child.selfTotalCost, copayAmount: child.selfCopayAmount }
  const selfStale =
    selfIdx >= 0 &&
    (offices[selfIdx].totalCost !== expectedSelf.totalCost || offices[selfIdx].copayAmount !== expectedSelf.copayAmount)

  /** 内訳の利用者負担額から、管理結果と「管理結果後利用者負担額」を計算する */
  const handleAutoCalc = () => {
    const copays = offices.map((o) => Number(o.copayAmount) || 0)
    const { result: r, managed } = calcManaged(copays, parseInt(copayLimit) || 0, selfIdx)
    setResult(r)
    setOffices((prev) => prev.map((o, i) => ({ ...o, managedCopayAmount: managed[i] })))
  }

  const sum = (key: keyof Pick<UpperLimitOfficeInput, 'totalCost' | 'copayAmount' | 'managedCopayAmount'>) =>
    offices.reduce((s, o) => s + (Number(o[key]) || 0), 0)

  /** 結果の額から管理結果の番号を推測する（手で選び直したら以後は触らない） */
  const handleResultAmount = (value: string) => {
    setResultAmount(value)
    setResultAmountFromFax(false)
    if (resultTouched || value === '') return
    const amount = parseInt(value) || 0
    if (amount === 0) setResult('1')
    else if (amount >= child.selfCopayAmount) setResult('2')
    else setResult('3')
  }

  const handleSave = async () => {
    setMessage('')
    setNotice('')
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
    // 当事業所の総費用額は請求明細（国保連に出す明細書）と同じ額にそろえられる。入力と違えば知らせる
    const applied = res.appliedSelfTotalCost
    if (isSelfManaged && applied != null && selfIdx >= 0) {
      const entered = Number(offices[selfIdx].totalCost) || 0
      setOffice(selfIdx, { totalCost: applied })
      if (applied !== entered) {
        // 入力額が「上限額管理加算込み」の額なのに、他事業所の総費用額が0円で加算が付かなかった場合
        const enteredWithAddition =
          !withAddition &&
          child.selfProjection != null &&
          projectSelfCost(child.selfProjection, true, child.copayLimit).totalCost === entered
        const zeroOffices = offices
          .filter((o) => o.officeNumber.trim() !== facilityNumber && !(Number(o.totalCost) > 0))
          .map((o) => o.officeName || o.officeNumber)
          .filter(Boolean)
        setNotice(
          enteredWithAddition
            ? `入力された ${yen(entered)} は、利用者負担上限額管理加算（150単位）込みの額です。` +
                `他の事業所${zeroOffices.length ? `（${zeroOffices.join('・')}）` : ''}の総費用額が0円のため加算は付かず、${yen(applied)} で保存しました。` +
                `他の事業所の利用がある月は、届いた上限管理一覧表の総費用額・利用者負担額を入力して保存し直してください。`
            : `当事業所の総費用額は、入力された ${yen(entered)} ではなく、請求明細の計算どおり ${yen(applied)} で保存しました。` +
                `${yen(entered)}が正しい場合は、児童別の月次サービス実績で加算（延長加算など）の付き方を確認してください。`,
        )
      }
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
            ) : usingFax ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                FAX 読み取り済み・未確定
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
            {usingFax ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? '保存中...' : usingFax ? 'この内容で確定' : '保存'}
          </Button>
        </div>
      </div>

      {child.conflict && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {child.conflict}
        </p>
      )}

      {usingFax && (
        <div className="flex items-start gap-1.5 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-2">
          <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p>
              FAX から読み取った額を入れてあります（<span className="font-semibold">まだ確定していません</span>）。
              {faxSources.join('・')}の FAX（You First の Gmail）と見比べて、合っていれば「この内容で確定」を押してください。
              押すまでは請求に入りません。
            </p>
            {waitingFaxOffices.length > 0 && (
              <p className="text-amber-700">
                まだ一覧表の FAX が届いていない事業所：{waitingFaxOffices.map((o) => o.officeName || o.officeNumber).join('・')}
              </p>
            )}
          </div>
        </div>
      )}

      {savedFaxMismatch.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          保存した内容が、届いた FAX の読み取りと違います（{savedFaxMismatch.join('／')}）。訂正の FAX でないか確かめてください
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
                    className={resultAmountFromFax ? 'bg-sky-50 border-sky-300' : undefined}
                  />
                  <span className="text-sm text-gray-500">円</span>
                </div>
                {resultAmountFromFax && <p className="text-[11px] text-sky-700 mt-0.5">FAX から読み取り（未確認）</p>}
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
            {carriedOffices.length > 0 && child.previous && (
              <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5">
                {parseInt(child.previous.yearMonth.slice(4, 6))}月に調整した事業所（
                {carriedOffices.map((o) => o.officeName || o.officeNumber).join('・')}
                ）を引き継いでいます。金額は今月届いた一覧表を見て入力してください
              </p>
            )}
            {selfStale && (
              <div className="flex items-center justify-between gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <span>
                  当事業所の行が最新の実績（総費用額 {yen(expectedSelf.totalCost)} / 負担額 {yen(expectedSelf.copayAmount)}
                  {withAddition && child.selfProjection ? '・上限額管理加算込み' : ''}）と違います
                </span>
                <button
                  type="button"
                  onClick={() => setOffice(selfIdx, { totalCost: expectedSelf.totalCost, copayAmount: expectedSelf.copayAmount })}
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
                        <div className="flex items-center gap-1">
                          <Input
                            value={o.officeName}
                            onChange={(e) => setOffice(i, { officeName: e.target.value })}
                            className="h-8"
                          />
                          {usingFax && isFaxRow(o) && (
                            <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                              FAX
                            </span>
                          )}
                        </div>
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
            {offices.some((o) => o.officeNumber.trim() !== facilityNumber && !(Number(o.totalCost) > 0)) && (
              <p className="text-xs text-amber-600">
                総費用額が0円の事業所があります（
                {offices
                  .filter((o) => o.officeNumber.trim() !== facilityNumber && !(Number(o.totalCost) > 0))
                  .map((o) => o.officeName || o.officeNumber || `項番${o.lineNo}`)
                  .join('・')}
                ）。利用がある事業所は、届いた上限管理一覧表の総費用額・利用者負担額を入力してください。
                利用がなかった事業所は行を削除してください（0円の事業所だけでは上限額管理加算は付きません）。
              </p>
            )}
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
                当事業所の「管理結果後」{yen(Number(offices[selfIdx].managedCopayAmount) || 0)}が、保護者への請求額になります。
                他の事業所に総費用額が入っていると、利用者負担上限額管理加算（150単位）が自動で付きます
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {notice && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {notice}
        </p>
      )}
      {message && <p className="text-xs text-green-600">{message}</p>}
    </div>
  )
}
