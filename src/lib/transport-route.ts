// 施設座標（山梨県南都留郡富士河口湖町小立4128-3）
export const FACILITY_LAT = 35.5022
export const FACILITY_LNG = 138.7479

// 地区名 → 近似座標
export const AREA_COORDS: Record<string, [number, number]> = {
  '小立':     [35.5031, 138.7424],
  '船津':     [35.5051, 138.7556],
  '大石':     [35.5133, 138.7227],
  '河口':     [35.4976, 138.7657],
  '勝山':     [35.4867, 138.7710],
  '長浜':     [35.4779, 138.7784],
  '西浜':     [35.4779, 138.7784],
  '大嵐':     [35.4659, 138.7775],
  '富士ヶ嶺': [35.4263, 138.7228],
  '鳴沢':     [35.4569, 138.6880],
  '忍草':     [35.4698, 138.8397],
  '忍野':     [35.4698, 138.8397],
  '小明見':   [35.4759, 138.7947],
  '新町':     [35.4870, 138.8094],
  '緑ヶ丘':   [35.4854, 138.8164],
  '下吉田':   [35.4892, 138.8224],
  '上暮地':   [35.4940, 138.7986],
  '上吉田':   [35.4979, 138.8098],
  '新西原':   [35.5001, 138.8046],
  '松山':     [35.4952, 138.8072],
}

export type RouteChildData = {
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

export type RouteGroup = {
  key: string
  label: string
  type: 'school' | 'area'
  children: RouteChildData[]
  lat: number | null
  lng: number | null
}

/** 日本語住所から地区名を抽出 */
export function extractArea(address: string): string {
  const s = address.replace(/^.+?[都道府県]/, '').replace(/^.+?郡/, '')
  const withoutMuni = s.replace(/^[^市町村]+[市町村]/, '')
  const area = withoutMuni.match(/^([^0-9０-９丁番号]+)/)?.[1]?.trim()
  return area || s.split(/[0-9０-９]/)[0].trim() || '不明エリア'
}

/** 地区名から座標を取得 */
export function getAreaCoords(areaName: string): [number, number] | null {
  if (AREA_COORDS[areaName]) return AREA_COORDS[areaName]
  for (const [key, coords] of Object.entries(AREA_COORDS)) {
    if (areaName.includes(key) || key.includes(areaName)) return coords
  }
  return null
}

/** 2点間の近似距離（度数法の二乗距離） */
export function dist2(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat1 - lat2
  const dlng = (lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180)
  return dlat * dlat + dlng * dlng
}

/** 児童リストをグループ化（学校 or 地区） */
export function buildRouteGroups(children: RouteChildData[], direction: 'pickup' | 'dropoff'): RouteGroup[] {
  const map = new Map<string, RouteGroup>()

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

/** 最近傍法でグループを施設から順に並び替え */
export function nearestNeighborSort(groups: RouteGroup[]): RouteGroup[] {
  const withCoords = groups.filter((g) => g.lat !== null && g.lng !== null)
  const withoutCoords = groups.filter((g) => g.lat === null || g.lng === null)

  const sorted: RouteGroup[] = []
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
