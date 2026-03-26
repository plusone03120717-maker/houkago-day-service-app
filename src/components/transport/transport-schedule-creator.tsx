'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { MapPin, School as SchoolIcon, Loader2, Car, Navigation } from 'lucide-react'

// 施設座標（山梨県南都留郡富士河口湖町小立4128-3）
const FACILITY_LAT = 35.5022
const FACILITY_LNG = 138.7479

// 地区名 → 近似座標（自宅送迎エリア用）
const AREA_COORDS: Record<string, [number, number]> = {
  // 富士河口湖町
  '小立':     [35.5031, 138.7424],
  '船津':     [35.5051, 138.7556],
  '大石':     [35.5133, 138.7227],
  '河口':     [35.4976, 138.7657],
  '勝山':     [35.4867, 138.7710],
  '長浜':     [35.4779, 138.7784],
  '西浜':     [35.4779, 138.7784],
  '大嵐':     [35.4659, 138.7775],
  '富士ヶ嶺': [35.4263, 138.7228],
  // 鳴沢村
  '鳴沢':     [35.4569, 138.6880],
  // 忍野村
  '忍草':     [35.4698, 138.8397],
  '忍野':     [35.4698, 138.8397],
  // 富士吉田市
  '小明見':   [35.4759, 138.7947],
  '新町':     [35.4870, 138.8094],
  '緑ヶ丘':   [35.4854, 138.8164],
  '下吉田':   [35.4892, 138.8224],
  '上暮地':   [35.4940, 138.7986],
  '上吉田':   [35.4979, 138.8098],
  '新西原':   [35.5001, 138.8046],
  '松山':     [35.4952, 138.8072],
}

type Vehicle = { id: string; name: string; capacity: number }

type ChildData = {
  child_id: string
  children: {
    id: string
    name: string
    postal_code: string | null
    address: string | null
    school_id: string | null
    schools: { id: string; name: string; latitude: number | null; longitude: number | null } | null
  } | null
  pickup_location_type: 'home' | 'school'
}

type Group = {
  key: string
  label: string
  type: 'school' | 'area'
  children: ChildData[]
  lat: number | null
  lng: number | null
}

interface Props {
  date: string
  unitId: string
  direction: 'pickup' | 'dropoff'
  vehicles: Vehicle[]
  onCreated: () => void
  onCancel: () => void
}

/** 日本語住所から地区名を抽出 */
function extractArea(address: string): string {
  let s = address.replace(/^.+?[都道府県]/, '').replace(/^.+?郡/, '')
  const withoutMuni = s.replace(/^[^市町村]+[市町村]/, '')
  const area = withoutMuni.match(/^([^0-9０-９丁番号]+)/)?.[1]?.trim()
  return area || s.split(/[0-9０-９]/)[0].trim() || '不明エリア'
}

/** 地区名から座標を取得 */
function getAreaCoords(areaName: string): [number, number] | null {
  if (AREA_COORDS[areaName]) return AREA_COORDS[areaName]
  for (const [key, coords] of Object.entries(AREA_COORDS)) {
    if (areaName.includes(key) || key.includes(areaName)) return coords
  }
  return null
}

/** グループ化（座標付き） */
function buildGroups(children: ChildData[], direction: 'pickup' | 'dropoff'): Group[] {
  const map = new Map<string, Group>()

  for (const c of children) {
    const isSchool = direction === 'pickup' && c.pickup_location_type === 'school'
    let key: string, label: string, type: 'school' | 'area'
    let lat: number | null = null, lng: number | null = null

    if (isSchool && c.children?.schools) {
      const school = c.children.schools
      key = `school_${school.id}`
      label = school.name
      type = 'school'
      lat = school.latitude ?? null
      lng = school.longitude ?? null
    } else {
      const addr = c.children?.address
      const area = addr ? extractArea(addr) : '住所未登録'
      key = `area_${area}`
      label = `${area}（自宅）`
      type = 'area'
      const coords = getAreaCoords(area)
      lat = coords?.[0] ?? null
      lng = coords?.[1] ?? null
    }

    if (!map.has(key)) map.set(key, { key, label, type, children: [], lat, lng })
    map.get(key)!.children.push(c)
  }

  return [...map.values()]
}

/** 2点間の近似距離（度数法の二乗距離、小エリアなら十分） */
function dist2(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat1 - lat2
  const dlng = (lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180)
  return dlat * dlat + dlng * dlng
}

/**
 * 最近傍法（Nearest Neighbor）でグループを施設から順に並び替え。
 * 座標不明のグループは末尾にまとめる。
 */
function nearestNeighborSort(groups: Group[]): Group[] {
  const withCoords = groups.filter((g) => g.lat !== null && g.lng !== null)
  const withoutCoords = groups.filter((g) => g.lat === null || g.lng === null)

  const sorted: Group[] = []
  const remaining = [...withCoords]
  let curLat = FACILITY_LAT
  let curLng = FACILITY_LNG

  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = dist2(curLat, curLng, remaining[i].lat!, remaining[i].lng!)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0]
    sorted.push(nearest)
    curLat = nearest.lat!
    curLng = nearest.lng!
  }

  return [...sorted, ...withoutCoords]
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
        .select('child_id, pickup_type, children(id, name, postal_code, address, school_id, schools(id, name, latitude, longitude))')
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
        children: a.children as unknown as ChildData['children'],
        pickup_location_type: settingsMap.get(a.child_id as string) ?? 'home',
      }))

      setTotalChildren(children.length)
      const rawGroups = buildGroups(children, direction)
      setGroups(nearestNeighborSort(rawGroups))
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
      <div className="flex items-center gap-1.5">
        <Navigation className="h-3.5 w-3.5 text-indigo-500" />
        <p className="text-xs font-semibold text-gray-500">
          施設から最短順のルート提案（{totalChildren}名）
        </p>
      </div>

      {/* 施設（出発地点） */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          出
        </span>
        <span>施設（富士河口湖町小立）</span>
      </div>

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

      {/* 施設（帰着地点） */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
        <span className="w-5 h-5 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          着
        </span>
        <span>施設に帰着</span>
      </div>

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
