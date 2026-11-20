/** 全体スケジュール（PC）の予定まわりの型 */

export type CalendarEvent = {
  id: string
  title: string
  event_type: string
  event_date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  location: string | null
  note: string | null
  child_id: string | null
  /** 付いている子の名前（child_id と schedule_event_children の両方から） */
  childNames: string[]
  /** 参加スタッフ（users.id）。空なら全員 */
  staffUserIds: string[]
}

export type ChildOption = {
  id: string
  name: string
  /** いちばん新しい個別支援計画の見直し日 */
  reviewDate: string | null
}

export type StaffOption = {
  /** users.id */
  userId: string
  name: string
}

/** 施設カレンダー（休業日・短縮・行事・祝日）。ここでは表示と注意にだけ使う */
export type FacilityDay = {
  event_date: string
  event_type: string
  title: string
}
