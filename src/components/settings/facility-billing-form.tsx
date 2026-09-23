'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save } from 'lucide-react'

// 地域区分コードは明細書 基本情報レコードにそのまま出力される。
// 「その他」= 23 は、前システムが国保連の取込に成功したCSVの実値にもとづく暫定値。
// 電子請求受付システム（簡易入力）の画面は地域区分をラベルでしか表示しないため、
// 同システムが書き出すCSVで確定させること。01〜07は未検証。
const REGION_OPTIONS = [
  { code: '01', label: '一級地（11.20円）', price: 11.2 },
  { code: '02', label: '二級地（10.96円）', price: 10.96 },
  { code: '03', label: '三級地（10.90円）', price: 10.9 },
  { code: '04', label: '四級地（10.72円）', price: 10.72 },
  { code: '05', label: '五級地（10.60円）', price: 10.6 },
  { code: '06', label: '六級地（10.36円）', price: 10.36 },
  { code: '07', label: '七級地（10.18円）', price: 10.18 },
  { code: '23', label: 'その他（10.00円）', price: 10 },
]

// 事業所番号は国保連CSVの全レコードに出力される。10桁の数字でないと取込で弾かれる
const FACILITY_NUMBER_PATTERN = /^\d{10}$/

interface Props {
  facilityId: string
  initialFacilityNumber: string
  initialRegionCode: string
  initialUnitPrice: number
}

export function FacilityBillingForm({
  facilityId,
  initialFacilityNumber,
  initialRegionCode,
  initialUnitPrice,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [facilityNumber, setFacilityNumber] = useState(initialFacilityNumber)
  const [regionCode, setRegionCode] = useState(initialRegionCode)
  const [unitPrice, setUnitPrice] = useState(String(initialUnitPrice))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleRegionChange = (code: string) => {
    setRegionCode(code)
    const preset = REGION_OPTIONS.find((r) => r.code === code)
    if (preset) setUnitPrice(String(preset.price))
  }

  const handleSave = async () => {
    const trimmed = facilityNumber.trim()
    if (!FACILITY_NUMBER_PATTERN.test(trimmed)) {
      setMessage('事業所番号は10桁の数字で入力してください')
      return
    }
    setSaving(true)
    setMessage('')
    const { error } = await supabase
      .from('facilities')
      .update({
        facility_number: trimmed,
        region_code: regionCode,
        unit_price: parseFloat(unitPrice) || 10,
      })
      .eq('id', facilityId)
    setSaving(false)
    if (error) {
      // facility_number は UNIQUE 制約つき
      setMessage(
        error.code === '23505'
          ? `事業所番号「${trimmed}」はすでに別の施設で使われています`
          : `保存に失敗しました: ${error.message}`,
      )
      return
    }
    setMessage('保存しました')
    router.refresh()
  }

  return (
    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-3">
      <p className="text-xs font-semibold text-gray-700">国保連請求設定（事業所番号・地域区分・単位数単価）</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">事業所番号（10桁）</label>
          <Input
            value={facilityNumber}
            onChange={(e) => setFacilityNumber(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="1234567890"
            maxLength={10}
            inputMode="numeric"
            className="font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">地域区分</label>
          <select
            value={regionCode}
            onChange={(e) => handleRegionChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.code}: {r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">単位数単価（円）</label>
          <Input
            type="number"
            step="0.01"
            min={10}
            max={11.2}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
          {message && <span className="text-xs text-gray-500">{message}</span>}
        </div>
      </div>
      <p className="text-xs text-gray-400">
        事業所番号は指定通知書に記載された10桁です。国保連請求CSVの全レコードに出力されるため、
        誤っていると取込で弾かれます。単位数単価は地域区分とサービス種類（放デイ等）で決まります。
      </p>
    </div>
  )
}
