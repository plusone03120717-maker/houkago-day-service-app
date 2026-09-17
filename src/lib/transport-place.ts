/**
 * 送迎の「場所」。保護者が行き先・帰り先を選ぶための共通の言い方。
 *
 * 既存の送迎設定（child_transport_settings / usage_plans）は場所を
 * location_type（home / school）だけで持っていたため、祖父母宅のような
 * 2つめの住所を指定できなかった。児童の登録住所（child_addresses）を
 * 選択肢に加えるため、location_type に「どの登録住所か」を足して表す。
 *
 *   home  + address_id = null … 児童の基本住所（children.address）
 *   home  + address_id       … その登録住所（祖父母宅など）
 *   school                   … 児童の学校
 *
 * サーバー・クライアントの両方から使うので、Supabase などの依存は持たせない。
 */

export type LocationType = 'home' | 'school'

/** 保護者が選べる場所の1つ */
export type TransportPlace = {
  /** 画面と保存で使う値。'school' / 'home' / 'addr:<child_addresses.id>' */
  value: string
  /** 「学校（○○小学校）」「自宅」「祖父母宅」 */
  label: string
  /** 住所の文字列。学校や未登録では null */
  address: string | null
}

/** 児童ごとの選択肢と、いまの既定値 */
export type ChildTransportPlaces = {
  childId: string
  places: TransportPlace[]
  /** 施設に登録されている既定の場所（送迎設定）。選択肢に無ければ先頭を使う */
  defaultPickup: string
  defaultDropoff: string
}

/** 保存された場所（DBの2列）を画面の値に戻す */
export function toPlaceValue(
  locationType: LocationType | null | undefined,
  addressId: string | null | undefined
): string {
  if (locationType === 'school') return 'school'
  return addressId ? `addr:${addressId}` : 'home'
}

/** 画面の値をDBの2列に分ける */
export function fromPlaceValue(value: string): {
  locationType: LocationType
  addressId: string | null
} {
  if (value === 'school') return { locationType: 'school', addressId: null }
  if (value.startsWith('addr:')) {
    return { locationType: 'home', addressId: value.slice('addr:'.length) }
  }
  return { locationType: 'home', addressId: null }
}

/** 値が選択肢に含まれているか。他人の住所IDを送られても弾けるようにする */
export function isKnownPlace(places: TransportPlace[], value: string): boolean {
  return places.some((p) => p.value === value)
}

/**
 * 選択肢の中からその値の表示名を引く。
 * 選択肢が手元に無いときは、言い切ると誤解を招くので控えめな名前にする
 * （登録住所を「自宅」と表示すると、祖父母宅へ送る日を見落とす）。
 */
export function placeLabel(places: TransportPlace[], value: string): string {
  const hit = places.find((p) => p.value === value)
  if (hit) return hit.label
  if (value === 'school') return '学校'
  return value.startsWith('addr:') ? '登録住所' : '自宅'
}

/** 児童1人分の材料から選択肢を組み立てる */
export function buildPlaces(input: {
  schoolName: string | null
  /** children.address。登録住所が1件も無いときの「自宅」 */
  baseAddress: string | null
  addresses: { id: string; label: string; address: string; is_default: boolean }[]
}): TransportPlace[] {
  const places: TransportPlace[] = []

  // 迎えに行く先として真っ先に選ぶことが多いので学校を先頭に置く
  if (input.schoolName) {
    places.push({ value: 'school', label: `学校（${input.schoolName}）`, address: null })
  }

  if (input.addresses.length > 0) {
    for (const a of input.addresses) {
      places.push({ value: `addr:${a.id}`, label: a.label, address: a.address })
    }
  } else if (input.baseAddress) {
    // 登録住所が無い児童でも自宅は選べるようにする
    places.push({ value: 'home', label: '自宅', address: input.baseAddress })
  }

  return places
}

/**
 * 既定の場所を決める。
 * 施設に登録されている送迎設定（home / school）を尊重しつつ、
 * 選択肢に無い場合は先頭（学校があれば学校、無ければ既定の住所）に落とす。
 */
export function defaultPlaceValue(
  places: TransportPlace[],
  locationType: LocationType | null | undefined,
  addresses: { id: string; is_default: boolean }[]
): string {
  if (locationType === 'school' && places.some((p) => p.value === 'school')) return 'school'
  const preferred = addresses.find((a) => a.is_default) ?? addresses[0]
  if (preferred && places.some((p) => p.value === `addr:${preferred.id}`)) {
    return `addr:${preferred.id}`
  }
  if (places.some((p) => p.value === 'home')) return 'home'
  return places[0]?.value ?? 'home'
}
