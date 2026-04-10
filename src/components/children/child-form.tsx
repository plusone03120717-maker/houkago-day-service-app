'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Save, Search, Loader2, Plus, Trash2, Star } from 'lucide-react'

type Unit = { id: string; name: string; service_type: string }
export type School = { id: string; municipality: string; name: string; address: string }

export type AddressEntry = {
  id?: string
  label: string
  postal_code: string
  address: string
  is_default: boolean
}

interface ChildData {
  id?: string
  name: string
  name_kana: string
  birth_date: string
  gender: string
  school_id: string
  school_name: string
  grade: string
  disability_type: string
  diagnosis: string
  allergy_info: string
  medical_info: string
  notes: string
  unit_ids: string[]
}

interface Props {
  units: Unit[]
  schools: School[]
  initial?: Partial<ChildData>
  initialAddresses?: AddressEntry[]
}

const GRADES = ['年少', '年中', '年長', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3']

// 和暦
const ERAS = [
  { name: '令和', baseYear: 2018, start: '2019-05-01' },
  { name: '平成', baseYear: 1988, start: '1989-01-08' },
  { name: '昭和', baseYear: 1925, start: '1926-12-25' },
] as const
type EraName = typeof ERAS[number]['name']

function isoToWareki(iso: string): { era: EraName; year: number; month: number; day: number } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  for (const era of ERAS) {
    if (iso >= era.start) {
      return { era: era.name, year: d.getFullYear() - era.baseYear, month: d.getMonth() + 1, day: d.getDate() }
    }
  }
  return null
}

function warekiToIso(era: string, year: string, month: string, day: string): string {
  const eraConfig = ERAS.find((e) => e.name === era)
  if (!eraConfig || !year || !month || !day) return ''
  const y = eraConfig.baseYear + parseInt(year)
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function eraMaxYear(era: string): number {
  if (era === '令和') return new Date().getFullYear() - 2018
  if (era === '平成') return 31
  if (era === '昭和') return 64
  return 99
}
const LABEL_PRESETS = ['自宅', '祖父母宅（父方）', '祖父母宅（母方）', '親戚宅', 'その他']

function newAddress(isDefault = false): AddressEntry {
  return { label: '自宅', postal_code: '', address: '', is_default: isDefault }
}

export function ChildForm({ units, schools, initial, initialAddresses }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<ChildData>({
    name: initial?.name ?? '',
    name_kana: initial?.name_kana ?? '',
    birth_date: initial?.birth_date ?? '',
    gender: initial?.gender ?? 'male',
    school_id: initial?.school_id ?? '',
    school_name: initial?.school_name ?? '',
    grade: initial?.grade ?? '',
    disability_type: initial?.disability_type ?? '',
    diagnosis: initial?.diagnosis ?? '',
    allergy_info: initial?.allergy_info ?? '',
    medical_info: initial?.medical_info ?? '',
    notes: initial?.notes ?? '',
    unit_ids: initial?.unit_ids ?? [],
  })

  // 住所リスト。既存データがない場合はlegacy単一住所から初期化
  const [addresses, setAddresses] = useState<AddressEntry[]>(() => {
    if (initialAddresses && initialAddresses.length > 0) return initialAddresses
    // レガシー: children.address から移行
    const legacyAddress = (initial as Record<string, string | undefined>)?.address ?? ''
    const legacyPostal = (initial as Record<string, string | undefined>)?.postal_code ?? ''
    if (legacyAddress) return [{ label: '自宅', postal_code: legacyPostal, address: legacyAddress, is_default: true }]
    return [newAddress(true)]
  })

  // 和暦入力モード
  const [warekiMode, setWarekiMode] = useState(false)
  const initWareki = isoToWareki(initial?.birth_date ?? '')
  const [warekiEra, setWarekiEra] = useState<EraName>(initWareki?.era ?? '令和')
  const [warekiYear, setWarekiYear] = useState(initWareki ? String(initWareki.year) : '')
  const [warekiMonth, setWarekiMonth] = useState(initWareki ? String(initWareki.month) : '')
  const [warekiDay, setWarekiDay] = useState(initWareki ? String(initWareki.day) : '')

  const handleWarekiChange = (era: EraName, year: string, month: string, day: string) => {
    const iso = warekiToIso(era, year, month, day)
    setForm((prev) => ({ ...prev, birth_date: iso }))
  }

  // 郵便番号検索中フラグ（住所インデックスごと）
  const [postalSearching, setPostalSearching] = useState<Record<number, boolean>>({})
  const [postalErrors, setPostalErrors] = useState<Record<number, string>>({})

  const set = (key: keyof ChildData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  // ひらがな→カタカナ変換
  const toKatakana = (str: string) =>
    str.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

  const kanaBufferRef = { current: '' }

  const handleNameCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
    kanaBufferRef.current = e.data
  }

  const handleNameCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const kana = toKatakana(e.data)
    if (kana) {
      setForm((prev) => ({
        ...prev,
        name_kana: prev.name_kana ? prev.name_kana + kana : kana,
      }))
    }
    kanaBufferRef.current = ''
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setForm((prev) => ({ ...prev, name: val, name_kana: val === '' ? '' : prev.name_kana }))
  }

  // 学校選択
  const municipalities = [...new Set(schools.map((s) => s.municipality))]

  const handleSchoolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '') {
      setForm((prev) => ({ ...prev, school_id: '', school_name: '' }))
    } else {
      const school = schools.find((s) => s.id === val)
      setForm((prev) => ({ ...prev, school_id: val, school_name: school?.name ?? '' }))
    }
  }

  const toggleUnit = (unitId: string) => {
    setForm((prev) => ({
      ...prev,
      unit_ids: prev.unit_ids.includes(unitId)
        ? prev.unit_ids.filter((id) => id !== unitId)
        : [...prev.unit_ids, unitId],
    }))
  }

  // --- 住所管理 ---
  const updateAddress = (idx: number, patch: Partial<AddressEntry>) => {
    setAddresses((prev) => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }

  const addAddress = () => {
    setAddresses((prev) => [...prev, newAddress(prev.length === 0)])
  }

  const removeAddress = (idx: number) => {
    setAddresses((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      // 削除したのがデフォルトなら先頭をデフォルトに
      if (prev[idx].is_default && next.length > 0) {
        next[0] = { ...next[0], is_default: true }
      }
      return next
    })
  }

  const setDefault = (idx: number) => {
    setAddresses((prev) => prev.map((a, i) => ({ ...a, is_default: i === idx })))
  }

  const searchPostal = async (idx: number, code: string) => {
    const digits = code.replace(/[^0-9]/g, '')
    if (digits.length !== 7) {
      setPostalErrors((prev) => ({ ...prev, [idx]: '7桁の数字で入力してください' }))
      return
    }
    setPostalSearching((prev) => ({ ...prev, [idx]: true }))
    setPostalErrors((prev) => ({ ...prev, [idx]: '' }))
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
      const json = await res.json() as { results: { address1: string; address2: string; address3: string }[] | null }
      if (!json.results?.[0]) {
        setPostalErrors((prev) => ({ ...prev, [idx]: '該当する住所が見つかりませんでした' }))
        return
      }
      const { address1, address2, address3 } = json.results[0]
      updateAddress(idx, { address: `${address1}${address2}${address3}` })
    } catch {
      setPostalErrors((prev) => ({ ...prev, [idx]: '住所の取得に失敗しました' }))
    } finally {
      setPostalSearching((prev) => ({ ...prev, [idx]: false }))
    }
  }

  const handlePostalCodeChange = (idx: number, val: string) => {
    const cleaned = val.replace(/[^0-9\-]/g, '')
    setPostalErrors((prev) => ({ ...prev, [idx]: '' }))
    updateAddress(idx, { postal_code: cleaned })
    if (cleaned.replace(/[^0-9]/g, '').length === 7) {
      searchPostal(idx, cleaned)
    }
  }

  // --- 保存 ---
  const handleSubmit = async () => {
    if (!form.name || !form.birth_date) {
      setError('氏名と生年月日は必須です')
      return
    }
    if (addresses.length > 0 && !addresses.some((a) => a.address.trim())) {
      setError('住所を入力してください')
      return
    }
    setSaving(true)
    setError('')

    // デフォルト住所をchildren.address / postal_code に同期（後方互換）
    const defaultAddr = addresses.find((a) => a.is_default) ?? addresses[0]

    const payload = {
      name: form.name,
      name_kana: form.name_kana || null,
      birth_date: form.birth_date,
      gender: form.gender,
      postal_code: defaultAddr?.postal_code || null,
      address: defaultAddr?.address || null,
      school_id: form.school_id || null,
      school_name: form.school_id
        ? (schools.find((s) => s.id === form.school_id)?.name ?? form.school_name ?? null)
        : (form.school_name || null),
      grade: form.grade || null,
      disability_type: form.disability_type || null,
      diagnosis: form.diagnosis || null,
      allergy_info: form.allergy_info || null,
      medical_info: form.medical_info || null,
      notes: form.notes || null,
      is_active: true,
    }

    let childId: string | undefined = initial?.id

    if (childId) {
      const { error: updateError } = await supabase.from('children').update(payload).eq('id', childId)
      if (updateError) { setError(updateError.message); setSaving(false); return }
    } else {
      const { data, error: insertError } = await supabase.from('children').insert(payload).select('id').single()
      if (insertError || !data) { setError(insertError?.message ?? '保存に失敗しました'); setSaving(false); return }
      childId = data.id
    }

    // ユニット割当を更新
    await supabase.from('children_units').delete().eq('child_id', childId!)
    if (form.unit_ids.length > 0) {
      const { error: unitError } = await supabase.from('children_units').insert(
        form.unit_ids.map((uid) => ({ child_id: childId!, unit_id: uid }))
      )
      if (unitError) { setError(unitError.message); setSaving(false); return }
    }

    // 住所を更新（全削除→再挿入）
    await supabase.from('child_addresses').delete().eq('child_id', childId!)
    const validAddresses = addresses.filter((a) => a.address.trim())
    if (validAddresses.length > 0) {
      const { error: addrError } = await supabase.from('child_addresses').insert(
        validAddresses.map((a, i) => ({
          child_id: childId!,
          label: a.label || '自宅',
          postal_code: a.postal_code || null,
          address: a.address,
          is_default: a.is_default,
          sort_order: i,
        }))
      )
      if (addrError) { setError(addrError.message); setSaving(false); return }
    }

    setSaving(false)
    startTransition(() => router.push(`/children/${childId}`))
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* 基本情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">氏名 *</label>
              <Input
                value={form.name}
                onChange={handleNameChange}
                onCompositionUpdate={handleNameCompositionUpdate}
                onCompositionEnd={handleNameCompositionEnd}
                placeholder="山田 太郎"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">フリガナ</label>
              <Input value={form.name_kana} onChange={set('name_kana')} placeholder="ヤマダ タロウ" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">生年月日 *</label>
                <div className="flex text-xs border border-gray-200 rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setWarekiMode(false)}
                    className={`px-2 py-0.5 ${!warekiMode ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                  >西暦</button>
                  <button
                    type="button"
                    onClick={() => {
                      setWarekiMode(true)
                      const w = isoToWareki(form.birth_date)
                      if (w) {
                        setWarekiEra(w.era)
                        setWarekiYear(String(w.year))
                        setWarekiMonth(String(w.month))
                        setWarekiDay(String(w.day))
                      }
                    }}
                    className={`px-2 py-0.5 ${warekiMode ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                  >和暦</button>
                </div>
              </div>
              {!warekiMode ? (
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={set('birth_date')}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <div className="flex items-center gap-1">
                  <select
                    value={warekiEra}
                    onChange={(e) => {
                      const era = e.target.value as EraName
                      setWarekiEra(era)
                      setWarekiYear('')
                      handleWarekiChange(era, '', warekiMonth, warekiDay)
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {ERAS.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
                  </select>
                  <select
                    value={warekiYear}
                    onChange={(e) => {
                      setWarekiYear(e.target.value)
                      handleWarekiChange(warekiEra, e.target.value, warekiMonth, warekiDay)
                    }}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">年</option>
                    {Array.from({ length: eraMaxYear(warekiEra) }, (_, i) => i + 1).map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600">年</span>
                  <select
                    value={warekiMonth}
                    onChange={(e) => {
                      setWarekiMonth(e.target.value)
                      handleWarekiChange(warekiEra, warekiYear, e.target.value, warekiDay)
                    }}
                    className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">月</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={String(m)}>{m}</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600">月</span>
                  <select
                    value={warekiDay}
                    onChange={(e) => {
                      setWarekiDay(e.target.value)
                      handleWarekiChange(warekiEra, warekiYear, warekiMonth, e.target.value)
                    }}
                    className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">日</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600">日</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">性別</label>
              <select
                value={form.gender}
                onChange={set('gender')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">学校</label>
              <select
                value={form.school_id}
                onChange={handleSchoolChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- 学校を選択 --</option>
                {municipalities.map((m) => (
                  <optgroup key={m} label={m}>
                    {schools.filter((s) => s.municipality === m).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {form.school_id && (
                <p className="text-xs text-gray-400 mt-1">
                  {schools.find((s) => s.id === form.school_id)?.address}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">学年</label>
              <select
                value={form.grade}
                onChange={set('grade')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">選択してください</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 住所 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">住所</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {addresses.map((addr, idx) => (
            <div key={idx} className={`rounded-xl border p-4 space-y-3 ${addr.is_default ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
              {/* ヘッダー行 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  {addr.is_default && (
                    <span className="flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      <Star className="h-3 w-3" />メイン
                    </span>
                  )}
                  {/* ラベル */}
                  <input
                    type="text"
                    value={addr.label}
                    onChange={(e) => updateAddress(idx, { label: e.target.value })}
                    placeholder="名前（例: 自宅）"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {!addr.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefault(idx)}
                      title="メイン住所に設定"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-xs"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  {addresses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAddress(idx)}
                      title="削除"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* ラベルのプリセット */}
              <div className="flex flex-wrap gap-1.5">
                {LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateAddress(idx, { label: preset })}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      addr.label === preset
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* 郵便番号 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">郵便番号</label>
                <div className="flex gap-2">
                  <Input
                    value={addr.postal_code}
                    onChange={(e) => handlePostalCodeChange(idx, e.target.value)}
                    placeholder="1234567"
                    maxLength={8}
                    className="w-36 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => searchPostal(idx, addr.postal_code)}
                    disabled={postalSearching[idx]}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                  >
                    {postalSearching[idx]
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Search className="h-3.5 w-3.5" />
                    }
                    住所を検索
                  </button>
                </div>
                {postalErrors[idx] && <p className="text-xs text-red-500 mt-1">{postalErrors[idx]}</p>}
              </div>

              {/* 住所 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">住所</label>
                <Input
                  value={addr.address}
                  onChange={(e) => updateAddress(idx, { address: e.target.value })}
                  placeholder="東京都〇〇区〇〇町1-2-3"
                  className="bg-white"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAddress}
            className="flex items-center gap-2 w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            住所を追加
          </button>
        </CardContent>
      </Card>

      {/* 障害・医療情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">障害・医療情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">障害種別</label>
              <Input value={form.disability_type} onChange={set('disability_type')} placeholder="知的障害、自閉症など" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">診断名</label>
              <Input value={form.diagnosis} onChange={set('diagnosis')} placeholder="ASD、ADHDなど" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">アレルギー情報</label>
            <textarea
              value={form.allergy_info}
              onChange={set('allergy_info')}
              rows={2}
              placeholder="食物アレルギーなどを記入"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">医療的ケア</label>
            <textarea
              value={form.medical_info}
              onChange={set('medical_info')}
              rows={2}
              placeholder="服薬、医療的ケアなどを記入"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">特記事項・備考</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="支援上の注意事項など"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* ユニット */}
      {units.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">所属ユニット</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUnit(u.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.unit_ids.includes(u.id)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button type="button" onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : initial?.id ? '変更を保存' : '児童を登録'}
      </Button>
    </div>
  )
}
