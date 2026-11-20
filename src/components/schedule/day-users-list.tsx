import { DAY_USER_STATUS_LABEL, type DayUser, type DayUserStatus } from '@/lib/day-users'
import { UNIT_COURSES } from '@/lib/unit-course'

/**
 * その日の利用者の一覧（全体スケジュールとスタッフ LINE の「会議・予定」で共通）。
 * デイ・英語・パソコンに分けて人数を出し、お休みの子はいちばん下に名前だけ並べる。
 */

const STATUS_CLASS: Record<DayUserStatus, string> = {
  attended: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-indigo-100 text-indigo-700',
  reserved: 'bg-amber-100 text-amber-700',
  plan: 'bg-gray-100 text-gray-600',
  absent: 'bg-gray-100 text-gray-400',
}

export function DayUsersList({
  users,
  absent,
  variant,
}: {
  users: DayUser[]
  absent: DayUser[]
  variant: 'pc' | 'liff'
}) {
  if (users.length === 0 && absent.length === 0) {
    return <p className="text-sm text-gray-400 px-1 py-2">この日の利用者はいません</p>
  }

  return (
    <div className="space-y-3">
      {UNIT_COURSES.map((c) => {
        const list = users.filter((u) => u.course === c.key)
        if (list.length === 0) return null
        return (
          <div key={c.key}>
            <p className="text-xs font-semibold text-gray-500 mb-1 px-1">
              {c.label} <span className="text-indigo-600">{list.length}名</span>
            </p>
            <div className={variant === 'pc' ? 'grid grid-cols-2 lg:grid-cols-3 gap-x-4' : ''}>
              {list.map((u) => (
                <div key={u.childId} className="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-900 truncate">{u.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {variant === 'pc' && u.unitName && <span className="text-[11px] text-gray-400">{u.unitName}</span>}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${STATUS_CLASS[u.status]}`}>
                      {DAY_USER_STATUS_LABEL[u.status]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {absent.length > 0 && (
        <p className="text-xs text-gray-400 px-1">
          お休み（{absent.length}名）：{absent.map((u) => u.name).join('・')}
        </p>
      )}
    </div>
  )
}
