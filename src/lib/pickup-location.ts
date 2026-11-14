import { isJapaneseNationalHoliday } from '@/lib/japanese-holidays'

/**
 * その日のお迎え場所（自宅・学校）の決め方。
 *
 * 送迎を作るとき（@/app/actions/transport の autoCreateTransportSchedules）と、
 * お迎え場所を変えたあとに作成ずみの行をそろえるとき（@/app/actions/transport-location）で
 * 決め方が食い違うと、そろえたあとに作り直すと戻る・逆になる。
 * そのため、両方ともここで決める（2026-11-14 プログラマー担当の点検）。
 */

export type PickupLocationType = 'home' | 'school'

/** どこで決まったか */
export type PickupSource =
  /** 保護者の利用連絡を承認した予約で指定された */
  | 'request'
  /** 利用スケジュールの特定日の上書きで指定された */
  | 'override'
  /** 利用スケジュール（曜日別設定・計画）のいつもの場所 */
  | 'plan'
  /** 計画も指定もない（予約だけ・出席記録だけ）ので自宅 */
  | 'none'

export type PickupInputs = {
  date: string
  /** その日・そのユニットに当たる計画（曜日・期間が合うもの。pickPrimaryPlanPerChild で1本に絞ったもの） */
  dayPlanType: string | null | undefined
  /** その日の計画がキャンセルされているか */
  cancelled: boolean
  /** 特定日の上書きの場所（キャンセルの跡は除いたもの） */
  overrideType: string | null | undefined
  /** 曜日別設定の場所 */
  daySettingType: string | null | undefined
  /** その日の予約があるか、あればその場所（空なら指定なし） */
  reservation: { pickup_location_type: string | null } | null
  /**
   * その日に当たる計画がないときに使う、同じユニットの計画の場所（曜日は問わない）。
   * 出席カレンダーなどから計画の曜日以外の日に足した児童に使う。
   */
  fallbackPlanType: string | null | undefined
}

export type PickupDecision = {
  type: PickupLocationType
  source: PickupSource
  /** いつもの場所（計画・曜日別設定）。計画がなければ null */
  baseType: PickupLocationType | null
  /** 学校が休みの日なので、学校を自宅に変えたか */
  schoolOffAdjusted: boolean
}

/** 学校が休みの日（土日・祝日）。冬休みなどの長い休みは学校ごとに違うので見ない */
export function isSchoolOffDay(date: string): boolean {
  const dow = new Date(`${date}T00:00:00`).getDay()
  return dow === 0 || dow === 6 || isJapaneseNationalHoliday(date)
}

const asType = (v: string | null | undefined): PickupLocationType | null =>
  v === 'home' || v === 'school' ? v : null

export function decidePickupLocation(i: PickupInputs): PickupDecision {
  let type: PickupLocationType
  let source: PickupSource
  let baseType: PickupLocationType | null

  const requested = asType(i.reservation?.pickup_location_type)
  if (i.dayPlanType !== undefined && !i.cancelled) {
    // 優先順位: その日の予約 > 特定日の上書き > 曜日別設定 > 計画
    baseType = asType(i.daySettingType) ?? asType(i.dayPlanType) ?? 'home'
    const override = asType(i.overrideType)
    if (requested) {
      type = requested
      source = 'request'
    } else if (override) {
      type = override
      source = 'override'
    } else {
      type = baseType
      source = 'plan'
    }
  } else if (i.reservation) {
    // 予約だけの日（計画がない・計画をキャンセルした日）は、予約の場所、なければ自宅
    baseType = null
    type = requested ?? 'home'
    source = requested ? 'request' : 'none'
  } else {
    // 出席記録だけの日は、同じユニットの計画の場所（曜日は問わない）
    baseType = asType(i.fallbackPlanType)
    type = baseType ?? 'home'
    source = baseType ? 'plan' : 'none'
  }

  // 土日・祝日は学校が休みなので、いつもの場所が学校でも自宅へ迎えに行く。
  // 保護者の指定・特定日の上書きで学校と決めた日はそのまま
  let schoolOffAdjusted = false
  if (type === 'school' && source === 'plan' && isSchoolOffDay(i.date)) {
    type = 'home'
    schoolOffAdjusted = true
  }

  return { type, source, baseType, schoolOffAdjusted }
}
