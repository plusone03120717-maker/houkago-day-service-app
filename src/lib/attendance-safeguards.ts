/**
 * 出席の入力で起きやすい取り違えを防ぐための判定（2026-11-25）。
 *
 * きっかけ：毎朝の点検で「出席なのに利用時間が空」が2件出た。
 *  - 11/17：欠席にした3秒後に出席に戻され、欠席で消えた時間が空のまま出席になった
 *  - 11/23：カレンダーで日中一時だけの日を作ると、放デイの区分が「使う」のまま残り、
 *           放デイの時間が空の「両方」の日になった
 */

const has = (t: string | null | undefined) => !!t && t !== '00:00' && t !== '00:00:00'

/** 出席なのに、放デイ・日中一時のどちらの利用時間も入っていないか（請求に入らない状態） */
export function isAttendedWithoutTime(row: {
  status?: string | null
  basic_service?: boolean | null
  service_start_time?: string | null
  service_end_time?: string | null
  check_in_time?: string | null
  check_out_time?: string | null
  daytime_support?: boolean | null
  daytime_support_start_time?: string | null
  daytime_support_end_time?: string | null
}): boolean {
  if (row.status !== 'attended') return false
  const basic = has(row.service_start_time ?? row.check_in_time) && has(row.service_end_time ?? row.check_out_time)
  const daytime = !!row.daytime_support && has(row.daytime_support_start_time) && has(row.daytime_support_end_time)
  return !basic && !daytime
}

/** 欠席の子を出席に変えるときの確認文。欠席から変えるのでなければ null */
export function absentToAttendedMessage(prevStatus: string | null | undefined): string | null {
  if (prevStatus !== 'absent') return null
  return (
    'この日は「欠席」になっています。「出席」に変えますか？\n\n' +
    '欠席にしたときに消えた送迎と、手で入れた時間は戻りません。出席にしたあと、利用時間と送迎を確かめてください。'
  )
}

/**
 * カレンダーで保存するときの放デイの区分（basic_service）。
 * 日中一時を使い、放デイの時間が開始・終了とも空なら「日中一時だけの日」として false。
 * それ以外は今までどおり true（列の既定値と同じ）。
 */
export function basicServiceFor(input: {
  daytimeSupport: boolean
  serviceStart: string | null | undefined
  serviceEnd: string | null | undefined
}): boolean {
  return !(input.daytimeSupport && !has(input.serviceStart) && !has(input.serviceEnd))
}
