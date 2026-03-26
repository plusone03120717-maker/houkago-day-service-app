'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Save, Search, Loader2 } from 'lucide-react'

type Unit = { id: string; name: string; service_type: string }
export type School = { id: string; municipality: string; name: string; address: string }

interface ChildData {
  id?: string
  name: string
  name_kana: string
  birth_date: string
  gender: string
  postal_code: string
  address: string
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
}

const GRADES = ['年少', '年中', '年長', '小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3']

export function ChildForm({ units, schools, initial }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [postalSearching, setPostalSearching] = useState(false)
  const [postalError, setPostalError] = useState('')

  const [form, setForm] = useState<ChildData>({
    name: initial?.name ?? '',
    name_kana: initial?.name_kana ?? '',
    birth_date: initial?.birth_date ?? '',
    gender: initial?.gender ?? 'male',
    postal_code: initial?.postal_code ?? '',
    address: initial?.address ?? '',
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

  const set = (key: keyof ChildData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  // ひらがな→カタカナ変換
  const toKatakana = (str: string) =>
    str.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

  // IME入力中の読み仮名を蓄積
  const kanaBufferRef = { current: '' }

  const handleNameCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
    kanaBufferRef.current = e.data
  }

  const handleNameCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const kana = toKatakana(e.data)
    if (kana) {
      setForm((prev) => ({
        ...prev,
        name_kana: prev.name_kana
          ? prev.name_kana + kana
          : kana,
      }))
    }
    kanaBufferRef.current = ''
  }

  // 名前フィールドをクリアしたらフリガナもリセット
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setForm((prev) => ({
      ...prev,
      name: val,
      name_kana: val === '' ? '' : prev.name_kana,
    }))
  }

  // 郵便番号から住所を自動入力
  const handlePostalSearch = async () => {
    const code = form.postal_code.replace(/[^0-9]/g, '')
    if (code.length !== 7) {
      setPostalError('7桁の数字で入力してください')
      return
    }
    setPostalSearching(true)
    setPostalError('')
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`)
      const json = await res.json() as { results: { address1: string; address2: string; address3: string }[] | null }
      if (!json.results || json.results.length === 0) {
        setPostalError('該当する住所が見つかりませんでした')
        return
      }
      const { address1, address2, address3 } = json.results[0]
      setForm((prev) => ({ ...prev, address: `${address1}${address2}${address3}` }))
    } catch {
      setPostalError('住所の取得に失敗しました')
    } finally {
      setPostalSearching(false)
    }
  }

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9\-]/g, '')
    setPostalError('')
    setForm((prev) => ({ ...prev, postal_code: val }))
    // 7桁揃ったら自動検索
    if (val.replace(/[^0-9]/g, '').length === 7) {
      const code = val.replace(/[^0-9]/g, '')
      setPostalSearching(true)
      setPostalError('')
      fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`)
        .then((r) => r.json())
        .then((json: { results: { address1: string; address2: string; address3: string }[] | null }) => {
          if (json.results?.[0]) {
            const { address1, address2, address3 } = json.results[0]
            setForm((prev) => ({ ...prev, address: `${address1}${address2}${address3}` }))
          } else {
            setPostalError('該当する住所が見つかりませんでした')
          }
        })
        .catch(() => setPostalError('住所の取得に失敗しました'))
        .finally(() => setPostalSearching(false))
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.birth_date) {
      setError('氏名と生年月日は必須です')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      name: form.name,
      name_kana: form.name_kana || null,
      birth_date: form.birth_date,
      gender: form.gender,
      postal_code: form.postal_code || null,
      address: form.address || null,
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
      // 更新
      const { error: updateError } = await supabase.from('children').update(payload).eq('id', childId)
      if (updateError) { setError(updateError.message); setSaving(false); return }
    } else {
      // 新規
      const { data, error: insertError } = await supabase.from('children').insert(payload).select('id').single()
      if (insertError || !data) { setError(insertError?.message ?? '保存に失敗しました'); setSaving(false); return }
      childId = data.id
    }

    // ユニット割当を更新
    const { error: deleteError } = await supabase.from('children_units').delete().eq('child_id', childId!)
    if (deleteError) { setError(deleteError.message); setSaving(false); return }
    if (form.unit_ids.length > 0) {
      const { error: insertError } = await supabase.from('children_units').insert(
        form.unit_ids.map((uid) => ({ child_id: childId!, unit_id: uid }))
      )
      if (insertError) { setError(insertError.message); setSaving(false); return }
    }

    setSaving(false)
    startTransition(() => router.push(`/children/${childId}`))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
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
              <label className="text-xs font-medium text-gray-700 mb-1 block">生年月日 *</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={set('birth_date')}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
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

          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">郵便番号</label>
              <div className="flex gap-2">
                <Input
                  value={form.postal_code}
                  onChange={handlePostalCodeChange}
                  placeholder="1234567"
                  maxLength={8}
                  className="w-36"
                />
                <button
                  type="button"
                  onClick={handlePostalSearch}
                  disabled={postalSearching}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                >
                  {postalSearching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Search className="h-3.5 w-3.5" />
                  }
                  住所を検索
                </button>
              </div>
              {postalError && <p className="text-xs text-red-500 mt-1">{postalError}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">住所</label>
              <Input value={form.address} onChange={set('address')} placeholder="東京都〇〇区〇〇町1-2-3" />
            </div>
          </div>
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

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4" />
        {saving ? '保存中...' : initial?.id ? '変更を保存' : '児童を登録'}
      </Button>
    </form>
  )
}
