import Link from 'next/link'
import { SmartphoneNfc, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { placeLabel, toPlaceValue, type TransportPlace } from '@/lib/transport-place'
import { resolveAssignment } from '@/lib/parent-contact-service'
import type { ParentContact } from '@/components/children/child-attendance-calendar'

/** 一覧に出す保護者の利用連絡。カレンダーと同じ列に、id と未対応かどうかを足したもの */
export type ParentRequest = ParentContact & {
  id: string
  /** まだ利用連絡の画面で承認・確認していない（ベルの未確認と同じ） */
  is_new: boolean
}

const TRANSPORT_LABELS: Record<ParentContact['transport_type'], string> = {
  none: '送迎なし',
  both: '送り迎え',
  pickup_only: '迎えのみ',
  dropoff_only: '送りのみ',
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : ''
}

function fmtDate(date: string) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`
}

/** 承認の状態。お休みの連絡は承認ではなく「確認」なので言い方を分ける */
function statusBadge(r: ParentRequest) {
  if (r.status === 'absent') {
    return r.is_new
      ? { label: '未確認', className: 'bg-amber-100 text-amber-800' }
      : { label: '確認済み', className: 'bg-gray-100 text-gray-500' }
  }
  if (r.approval_status === 'approved') return { label: '承認済み', className: 'bg-emerald-600 text-white' }
  if (r.approval_status === 'rejected') return { label: '非承認', className: 'bg-gray-500 text-white' }
  return { label: '承認待ち', className: 'bg-amber-100 text-amber-800' }
}

/** 承認のときに施設が割り振った区分。出席カレンダーの右上の■と同じ色 */
function serviceBadge(r: ParentRequest) {
  if (r.status !== 'attending' || r.approval_status !== 'approved') return null
  const type = resolveAssignment(r).serviceType
  if (type === 'daytime_support') return { label: '日中一時', className: 'bg-orange-100 text-orange-700' }
  if (type === 'both') return { label: '放デイ＋日中一時', className: 'bg-purple-100 text-purple-700' }
  return { label: '放デイ', className: 'bg-green-100 text-green-700' }
}

function isOpen(r: ParentRequest) {
  return r.is_new || (r.status === 'attending' && r.approval_status === 'pending')
}

/**
 * 子どもの利用スケジュール画面に出す「保護者からの予約申請」。
 * 保護者ポータル・LINE から届いた利用連絡（利用したい日・お休みの日）を、
 * 承認待ちのもの（月をまたいで全部）と、表示中の月のものを日付順に並べる。
 * 承認・確認そのものは利用連絡の画面（/parent-contacts）で行う。
 */
export function ChildParentRequests({
  requests,
  month,
  transportPlaces,
}: {
  requests: ParentRequest[]
  month: number
  transportPlaces: TransportPlace[]
}) {
  const openCount = requests.filter(isOpen).length

  return (
    <Card className={cn(openCount > 0 && 'border-amber-300')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <SmartphoneNfc className="h-4 w-4 text-amber-500" />
            保護者からの予約申請
            {openCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                承認待ち {openCount}件
              </span>
            )}
          </CardTitle>
          {openCount > 0 && (
            <Link
              href="/parent-contacts"
              className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-0.5"
            >
              利用連絡の画面で承認する
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">
            {month}月の予約申請はありません
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 -my-1">
            {requests.map((r) => {
              const badge = statusBadge(r)
              const service = serviceBadge(r)
              const open = isOpen(r)
              const wishTime = (fmtTime(r.service_start_time) || fmtTime(r.service_end_time))
                ? `${fmtTime(r.service_start_time) || '—'}〜${fmtTime(r.service_end_time) || '—'}`
                : null
              const showPickup = r.transport_type === 'pickup_only' || r.transport_type === 'both'
              const showDropoff = r.transport_type === 'dropoff_only' || r.transport_type === 'both'
              return (
                <li
                  key={r.id}
                  className={cn(
                    'py-2 px-2 -mx-2 rounded-lg flex items-start gap-3',
                    open && 'bg-amber-50'
                  )}
                >
                  <span className="text-sm font-semibold text-gray-900 w-20 shrink-0 tabular-nums">
                    {fmtDate(r.date)}
                  </span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn(
                        'text-sm font-semibold',
                        r.status === 'absent' ? 'text-red-600' : 'text-gray-800'
                      )}>
                        {r.status === 'absent' ? 'お休み' : '利用したい'}
                      </span>
                      {wishTime && r.status === 'attending' && (
                        <span className="text-xs text-gray-600 tabular-nums">{wishTime}</span>
                      )}
                      {r.status === 'attending' && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          r.transport_type !== 'none' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        )}>
                          {TRANSPORT_LABELS[r.transport_type]}
                        </span>
                      )}
                    </div>
                    {r.status === 'attending' && (showPickup || showDropoff) && (
                      <p className="text-xs text-gray-500">
                        {showPickup && `迎え ${placeLabel(transportPlaces, toPlaceValue(r.pickup_location_type, r.pickup_address_id))}`}
                        {showPickup && showDropoff && '・'}
                        {showDropoff && `送り ${placeLabel(transportPlaces, toPlaceValue(r.dropoff_location_type, r.dropoff_address_id))}`}
                      </p>
                    )}
                    {r.note && (
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{r.note}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className="flex items-center gap-1">
                      {service && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', service.className)}>
                          {service.label}
                        </span>
                      )}
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {new Date(r.reported_at).toLocaleString('ja-JP', {
                        timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })} 受信
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
