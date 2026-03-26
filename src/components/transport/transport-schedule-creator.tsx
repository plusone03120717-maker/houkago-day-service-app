'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { MapPin, School as SchoolIcon, Loader2, Car } from 'lucide-react'

type Vehicle = { id: string; name: string; capacity: number }

type ChildData = {
  child_id: string
  children: {
    id: string
    name: string
    postal_code: string | null
    address: string | null
    school_id: string | null
    schools: { id: string; name: string } | null
  } | null
  pickup_location_type: 'home' | 'school'
}

type Group = {
  key: string
  label: string
  type: 'school' | 'area'
  children: ChildData[]
}

interface Props {
  date: string
  unitId: string
  direction: 'pickup' | 'dropoff'
  vehicles: Vehicle[]
  onCreated: () => void
  onCancel: () => void
}

/** 日本語住所から丁目より手前のエリア名を抽出 */
function extractArea(address: string): string {
  // 都道府県・郡を除去
  let s = address.replace(/^.+?[都道府県]/, '').replace(/^.+?郡/, '')
  // 市町村名を除去
  const withoutMuni = s.replace(/^[^市町村]+[市町村]/, '')
  // 数字・丁目・番・号の前まで抽出
  const area = withoutMuni.match(/^([^0-9０-９丁番号]+)/)?.[1]?.trim()
  return area || s.split(/[0-9０-９]/)[0].trim() || '不明エリア'
}

function buildGroups(children: ChildData[], direction: 'pickup' | 'dropoff'): Group[] {
  const map = new Map<string, Group>()

  for (const c of children) {
    const isSchool = direction === 'pickup' && c.pickup_location_type === 'school'
    let key: string, label: string, type: 'school' | 'area'

    if (isSchool && c.children?.schools) {
      key = `school_${c.children.schools.id}`
      label = c.children.schools.name
      type = 'school'
    } else {
      const addr = c.children?.address
      const area = addr ? extractArea(addr) : '住所未登録'
      key = `area_${area}`
      label = `${area}（自宅）`
      type = 'area'
    }

    if (!map.has(key)) map.set(key, { key, label, type, children: [] })
    map.get(key)!.children.push(c)
  }

  // 学校グループを先、次にエリアグループ（五十音順）
  return [...map.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'school' ? -1 : 1
    return a.label.localeCompare(b.label, 'ja')
  })
}

export function TransportScheduleCreator({
  date, unitId, direction, vehicles, onCreated, onCancel,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<Group[]>([])
  const [totalChildren, setTotalChildren] = useState(0)
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const [departureTime, setDepartureTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const pickupFilter = direction === 'pickup' ? ['both', 'pickup_only'] : ['both', 'dropoff_only']

      const { data: attendanceRaw } = await supabase
        .from('daily_attendance')
        .select('child_id, pickup_type, children(id, name, postal_code, address, school_id, schools(id, name))')
        .eq('unit_id', unitId)
        .eq('date', date)
        .neq('status', 'absent')
        .in('pickup_type', pickupFilter)

      const childIds = (attendanceRaw ?? []).map((a) => a.child_id as string)

      const { data: settingsRaw } = childIds.length > 0
        ? await supabase
            .from('child_transport_settings')
            .select('child_id, pickup_location_type')
            .in('child_id', childIds)
        : { data: [] }

      const settingsMap = new Map(
        (settingsRaw ?? []).map((s) => [s.child_id as string, s.pickup_location_type as 'home' | 'school'])
      )

      const children: ChildData[] = (attendanceRaw ?? []).map((a) => ({
        child_id: a.child_id as string,
        children: a.children as ChildData['children'],
        pickup_location_type: settingsMap.get(a.child_id as string) ?? 'home',
      }))

      setTotalChildren(children.length)
      setGroups(buildGroups(children, direction))
      setLoading(false)
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, unitId, direction])

  const handleCreate = async () => {
    setSaving(true)
    setError(null)

    const { data: schedule, error: schedErr } = await supabase
      .from('transport_schedules')
      .insert({
        unit_id: unitId,
        date,
        vehicle_id: vehicleId || null,
        direction,
        departure_time: departureTime || null,
        route_order: [],
      })
      .select('id')
      .single()

    if (schedErr || !schedule) {
      setError(schedErr?.message ?? '作成に失敗しました')
      setSaving(false)
      return
    }

    const orderedChildren = groups.flatMap((g) => g.children)
    if (orderedChildren.length > 0) {
      const { error: detailErr } = await supabase.from('transport_details').insert(
        orderedChildren.map((c) => ({
          schedule_id: schedule.id,
          child_id: c.child_id,
          pickup_location:
            direction === 'pickup' && c.pickup_location_type === 'school'
              ? (c.children?.schools?.name ?? null)
              : (c.children?.address ?? null),
          status: 'scheduled',
        }))
      )
      if (detailErr) {
        setError(detailErr.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onCreated()
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (totalChildren === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400 text-center py-2">
          {direction === 'pickup' ? 'お迎え' : 'お送り'}対象の児童がいません
        </p>
        <Button onClick={onCancel} variant="outline" size="sm" className="w-full">
          キャンセル
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        グループ別ルート提案（{totalChildren}名）
      </p>

      {groups.map((group, i) => (
        <div key={group.key} className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {i + 1}
            </span>
            {group.type === 'school'
              ? <SchoolIcon className="h-3.5 w-3.5 text-indigo-500" />
              : <MapPin className="h-3.5 w-3.5 text-green-500" />
            }
            <span>{group.label}</span>
            <span className="text-gray-400 font-normal">（{group.children.length}名）</span>
          </div>
          <div className="ml-7 space-y-1">
            {group.children.map((c) => (
              <div key={c.child_id} className="py-1.5 px-3 bg-gray-50 rounded text-sm text-gray-700">
                {c.children?.name ?? '不明'}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">使用車両</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">未選択</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">出発時刻</label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={saving} size="sm" className="flex-1">
          <Car className="h-3.5 w-3.5" />
          {saving ? '作成中...' : 'スケジュールを作成'}
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          キャンセル
        </Button>
      </div>
    </div>
  )
}
