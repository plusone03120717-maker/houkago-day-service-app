import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import {
  loadUsageContacts,
  loadFacilitySchedule,
  loadFacilityClosures,
  loadTransportPlaces,
  loadBenefitLimits,
  loadReservationDeadline,
  loadUsageContactDefaults,
} from '@/lib/parent-usage-contact'
import { deadlineDateFor, isMonthClosed } from '@/lib/parent-reservation-deadline'
import { getTodayJST } from '@/lib/utils'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** 保護者ポータルの利用連絡カレンダー：その月の連絡とお子さま一覧を返す */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { year, month } = await req.json() as { year?: number; month?: number }
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const { data: rows } = await adminClient
      .from('parent_children')
      .select('children (id, name)')
      .eq('user_id', userId)

    const children = ((rows ?? []) as unknown as {
      children: { id: string; name: string } | null
    }[])
      .map((r) => r.children)
      .filter((c): c is { id: string; name: string } => c !== null)

    if (children.length === 0) {
      return NextResponse.json({
        children: [], contacts: [], schedule: [], closures: [], places: [], benefits: [],
        deadline: null, defaults: [],
      })
    }

    const childIds = children.map((c) => c.id)
    // 保護者自身が送った連絡と、施設側ですでに決まっている予定の両方を返す。
    // 施設の予定が見えないと、毎週の利用スケジュールがある日にも
    // 重ねて連絡を送ってしまい、確認の手間が増える
    const [contacts, schedule, closures, places, benefits, deadline, defaults] = await Promise.all([
      loadUsageContacts(adminClient, childIds, year, month),
      loadFacilitySchedule(adminClient, childIds, year, month),
      loadFacilityClosures(adminClient, childIds, year, month),
      // 送迎の行き先・帰り先の選択肢（学校・登録住所）
      loadTransportPlaces(adminClient, childIds),
      // 給付日数の上限。利用済みの日数と並べて残りを出す
      loadBenefitLimits(adminClient, childIds, year, month),
      // 利用連絡の申込締切。新しい日を足せる月かどうかを画面で出し分けるために返す
      loadReservationDeadline(adminClient, childIds),
      // 前に送った内容。毎回同じ時間・送迎を入れ直さずに済むよう初期値にする
      loadUsageContactDefaults(adminClient, childIds),
    ])

    return NextResponse.json({
      children, contacts, schedule, closures, places, benefits, defaults,
      deadline: {
        enabled: deadline.enabled,
        day: deadline.day,
        // この月の新規申込が締め切られているか（締切日当日はまだ受け付ける）
        closed: isMonthClosed(year, month, deadline, getTodayJST()),
        deadlineDate: deadlineDateFor(year, month, deadline.day),
      },
    })
  } catch (err) {
    console.error('[parent/usage-contacts/month]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
