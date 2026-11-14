/**
 * お迎え場所を変えたときに、変えるかどうかを人が選ぶ送迎の行。
 * サーバー（@/app/actions/transport-location）と確認の画面で共有する。
 */
export type PickupReviewReason = 'manual' | 'request' | 'override' | 'holiday'

export type PickupReviewItem = {
  /** transport_details.id */
  id: string
  date: string
  /** 今の乗車場所 */
  from: string | null
  /** 変えたときの乗車場所 */
  to: string
  reason: PickupReviewReason
  /** 確認の画面で初めから「変える」にしておくか */
  recommended: boolean
}

export type PickupSyncResult = {
  /** 確認なしでそろえた行の数 */
  updated: number
  review: PickupReviewItem[]
}

/** 確認の画面に出す、その日を確かめる理由 */
export const PICKUP_REVIEW_NOTES: Record<PickupReviewReason, { label: string; note: string }> = {
  manual: {
    label: '送迎管理で選んだ場所',
    note: '送迎管理でこの日だけ選んだ場所です。変えると、この場所は消えます。',
  },
  request: {
    label: '保護者の利用連絡',
    note: '保護者の利用連絡でこの日の場所が指定されています。変えると、この日の利用予定の場所も新しい場所になります。',
  },
  override: {
    label: '特定日の上書き',
    note: '利用スケジュールの「特定日の上書き」でこの日の場所が指定されています。変えると、上書きの場所も新しい場所になります。',
  },
  holiday: {
    label: '土日・祝日',
    note: '土日・祝日で学校が休みなので、自宅のお迎えのままにしています。',
  },
}
