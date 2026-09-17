/**
 * 保護者の利用連絡のサービス区分（放デイ / 日中一時 / 両方）。
 *
 * 区分は保護者に選ばせない。日中一時支援を使えるかどうかは受給者証と支給量の残りで
 * 決まるもので、保護者はその判断材料を持っていないため、施設が承認するときに割り振る。
 * 保護者が送るのは「利用したい時間」と「送迎の希望」だけ。
 *
 * 同じ日に放デイと日中一時の両方を使う日（学校休業日など）は 'both' として扱い、
 * それぞれの時間を分けて持つ。時間帯が重なると送迎加算・請求が二重に立つため、
 * 重なりは validateAssignment で弾く。
 *
 * サーバー・クライアントの両方から使うので、Supabase などの依存は持たせない。
 */

export type ServiceAssignmentType = 'regular' | 'daytime_support' | 'both'

export const SERVICE_ASSIGNMENT_TYPES: ServiceAssignmentType[] = [
  'regular',
  'daytime_support',
  'both',
]

export const SERVICE_ASSIGNMENT_LABELS: Record<ServiceAssignmentType, string> = {
  regular: '放デイ',
  daytime_support: '日中一時',
  both: '放デイ＋日中一時',
}

/** バッジの配色。画面をまたいで同じ色で出す */
export const SERVICE_ASSIGNMENT_BADGE: Record<ServiceAssignmentType, string> = {
  regular: 'bg-green-100 text-green-700',
  daytime_support: 'bg-orange-100 text-orange-600',
  both: 'bg-purple-100 text-purple-700',
}

/** 施設が割り振った区分と、それぞれの時間 */
export type ServiceAssignment = {
  serviceType: ServiceAssignmentType
  /** 放デイの時間。日中一時だけの日は null */
  serviceStartTime: string | null
  serviceEndTime: string | null
  /** 日中一時の時間。放デイだけの日は null */
  daytimeStartTime: string | null
  daytimeEndTime: string | null
}

/** 割り振りを読み出すのに必要な列。連絡の行をそのまま渡せる */
export type AssignmentSource = {
  service_type: ServiceAssignmentType
  /** 保護者が希望した利用時間（施設の割り振りではない） */
  service_start_time: string | null
  service_end_time: string | null
  assigned_service_start_time: string | null
  assigned_service_end_time: string | null
  assigned_daytime_start_time: string | null
  assigned_daytime_end_time: string | null
}

/** select に足す列。PARENT_CONTACT_COLUMNS などから使う */
export const SERVICE_ASSIGNMENT_COLUMNS =
  'assigned_service_start_time, assigned_service_end_time, ' +
  'assigned_daytime_start_time, assigned_daytime_end_time'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** DBの time 型（HH:MM:SS）を HH:MM に切り詰める。未設定・空文字は null */
export function toHhmm(v: string | null | undefined): string | null {
  if (!v) return null
  return v.slice(0, 5)
}

/**
 * 保存されている割り振りを取り出す。
 *
 * まだ割り振られていない連絡（assigned_* が空）は、保護者の希望時間をそのまま
 * その区分の時間として扱う。承認画面を開いたときの初期値もこれで決まる。
 * 'both' だけは切り替え時刻を施設が決めない限り確定しないので、空のまま返す。
 */
export function resolveAssignment(c: AssignmentSource): ServiceAssignment {
  const wishStart = toHhmm(c.service_start_time)
  const wishEnd = toHhmm(c.service_end_time)

  if (c.service_type === 'both') {
    return {
      serviceType: 'both',
      serviceStartTime: toHhmm(c.assigned_service_start_time),
      serviceEndTime: toHhmm(c.assigned_service_end_time),
      daytimeStartTime: toHhmm(c.assigned_daytime_start_time),
      daytimeEndTime: toHhmm(c.assigned_daytime_end_time),
    }
  }

  if (c.service_type === 'daytime_support') {
    return {
      serviceType: 'daytime_support',
      serviceStartTime: null,
      serviceEndTime: null,
      daytimeStartTime: toHhmm(c.assigned_daytime_start_time) ?? wishStart,
      daytimeEndTime: toHhmm(c.assigned_daytime_end_time) ?? wishEnd,
    }
  }

  return {
    serviceType: 'regular',
    serviceStartTime: toHhmm(c.assigned_service_start_time) ?? wishStart,
    serviceEndTime: toHhmm(c.assigned_service_end_time) ?? wishEnd,
    daytimeStartTime: null,
    daytimeEndTime: null,
  }
}

/**
 * 承認画面で区分を切り替えたときの初期値。
 *
 * 'both' は「午前に日中一時 → 午後から放デイ」が学校休業日の通常の形なので、
 * 希望時間の始まりを日中一時の開始、終わりを放デイの終了に当てておく。
 * 切り替え時刻（日中一時の終了＝放デイの開始）は施設が決めるものなので空のまま。
 */
export function defaultAssignment(
  c: AssignmentSource,
  serviceType: ServiceAssignmentType
): ServiceAssignment {
  const wishStart = toHhmm(c.service_start_time)
  const wishEnd = toHhmm(c.service_end_time)
  const stored = resolveAssignment({ ...c, service_type: serviceType })

  if (serviceType === 'both') {
    return {
      serviceType: 'both',
      serviceStartTime: stored.serviceStartTime,
      serviceEndTime: stored.serviceEndTime ?? wishEnd,
      daytimeStartTime: stored.daytimeStartTime ?? wishStart,
      daytimeEndTime: stored.daytimeEndTime,
    }
  }
  return stored
}

/** 出席記録（daily_attendance）のうち、割り振りに関わる列 */
export type AttendanceAssignmentSource = {
  basic_service: boolean
  service_start_time: string | null
  service_end_time: string | null
  daytime_support: boolean
  daytime_support_start_time: string | null
  daytime_support_end_time: string | null
}

/**
 * その日の出席記録から、いま入っている割り振りを読み取る。
 *
 * 承認画面の初期値に使う。すでにスタッフが出席管理で予定を入れている日を
 * 承認するときに、画面が保護者の希望時間しか映していないと、
 * 承認した拍子にスタッフの入力を書き換えてしまうため。
 * まだ何も入っていない記録では null を返し、連絡側の値を使わせる。
 */
export function attendanceToAssignment(
  att: AttendanceAssignmentSource | null | undefined
): ServiceAssignment | null {
  if (!att) return null
  const hasAny =
    att.daytime_support ||
    att.service_start_time ||
    att.service_end_time ||
    att.daytime_support_start_time ||
    att.daytime_support_end_time
  if (!hasAny) return null

  return {
    serviceType: att.daytime_support
      ? att.basic_service ? 'both' : 'daytime_support'
      : 'regular',
    serviceStartTime: toHhmm(att.service_start_time),
    serviceEndTime: toHhmm(att.service_end_time),
    daytimeStartTime: toHhmm(att.daytime_support_start_time),
    daytimeEndTime: toHhmm(att.daytime_support_end_time),
  }
}

/** 割り振りを DB の列に落とす */
export function assignmentToColumns(a: ServiceAssignment) {
  return {
    service_type: a.serviceType,
    assigned_service_start_time: a.serviceStartTime,
    assigned_service_end_time: a.serviceEndTime,
    assigned_daytime_start_time: a.daytimeStartTime,
    assigned_daytime_end_time: a.daytimeEndTime,
  }
}

/** 割り振りの内容を確かめる。問題があればその理由を返す */
export function validateAssignment(a: ServiceAssignment): string | null {
  if (!SERVICE_ASSIGNMENT_TYPES.includes(a.serviceType)) {
    return 'サービス区分が正しくありません'
  }

  const times = [a.serviceStartTime, a.serviceEndTime, a.daytimeStartTime, a.daytimeEndTime]
  if (times.some((t) => t !== null && !TIME_RE.test(t))) {
    return '時刻の形式が正しくありません'
  }

  const basic = a.serviceStartTime && a.serviceEndTime
  const daytime = a.daytimeStartTime && a.daytimeEndTime
  if (basic && a.serviceStartTime! >= a.serviceEndTime!) {
    return '放デイの時間は終了を開始より後にしてください'
  }
  if (daytime && a.daytimeStartTime! >= a.daytimeEndTime!) {
    return '日中一時の時間は終了を開始より後にしてください'
  }

  if (a.serviceType === 'both') {
    // 両方の日は切り替え時刻が決まって初めて予定にできる。
    // 片方だけだと出席管理も請求もどちらの時間か判断できない。
    if (!basic || !daytime) {
      return '放デイと日中一時の時間をどちらも入力してください'
    }
    // 同じ時間帯に2つのサービスは立てられない。
    // 重なったまま反映すると送迎加算・利用者負担が二重に立つ。
    if (a.serviceStartTime! < a.daytimeEndTime! && a.daytimeStartTime! < a.serviceEndTime!) {
      return '放デイと日中一時の時間が重なっています'
    }
  }

  return null
}

/** 割り振りの内容を1行で表す（「日中一時 9:00〜14:00 / 放デイ 14:00〜18:00」） */
export function describeAssignment(a: ServiceAssignment): string {
  const range = (s: string | null, e: string | null) =>
    s || e ? `${s ?? '—'}〜${e ?? '—'}` : '時間指定なし'

  if (a.serviceType === 'both') {
    return `日中一時 ${range(a.daytimeStartTime, a.daytimeEndTime)} / 放デイ ${range(a.serviceStartTime, a.serviceEndTime)}`
  }
  if (a.serviceType === 'daytime_support') {
    return `日中一時 ${range(a.daytimeStartTime, a.daytimeEndTime)}`
  }
  return `放デイ ${range(a.serviceStartTime, a.serviceEndTime)}`
}
