import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getSessionUserId } from '@/lib/auth'
import {
  validateUsageContact,
  validateTransportPlaces,
  saveUsageContactsForDates,
  loadFacilityClosures,
  loadTransportPlaces,
  loadReservationDeadline,
  validateContactTargets,
  type UsageContactEntry,
} from '@/lib/parent-usage-contact'

// parent_attendance_contacts はスタッフ・管理者しか書けないRLSなので、
// ログイン中の保護者の子かどうかをここで確かめてから service role で書き込む。
const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** 一度に申し込める日数の上限。1〜2か月分をまとめて出せれば足りる */
const MAX_DATES = 70

/**
 * 保護者ポータルから利用・キャンセルを連絡する。
 *
 * date で1日、dates で複数日をまとめて受け取る（同じ内容を選んだ日数分保存する）。
 * 毎日のように利用する子は1日ずつ送ると20回以上の操作になるため、
 * 画面から「まとめて申し込む」で送れるようにしてある。
 *
 * まとめて送られた日のうち、送れない日（施設のお休み・締切後の新規など）は
 * その日だけ飛ばして残りを保存する。1日の不備で全部が送れないと、
 * どれが通ってどれが通らなかったのか保護者には分からないため。
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const { date, dates, entries } = await req.json() as {
      date?: string
      dates?: string[]
      entries?: UsageContactEntry[]
    }

    const targetDates = [...new Set(dates ?? (date ? [date] : []))].sort()
    if (targetDates.length === 0) {
      return NextResponse.json({ error: '日付が選ばれていません' }, { status: 400 })
    }
    if (targetDates.length > MAX_DATES) {
      return NextResponse.json(
        { error: `一度に申し込めるのは${MAX_DATES}日までです` },
        { status: 400 }
      )
    }

    // 日付ごとの形式・過去日・キャンセルの期限を確かめる。
    // ここで弾かれるのは内容そのものの不備なので、1日でも引っかかれば止める
    for (const d of targetDates) {
      const invalid = validateUsageContact(d, entries)
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    }

    // 自分の子どもの分しか送れないようにする
    const { data: links } = await adminClient
      .from('parent_children')
      .select('child_id')
      .eq('user_id', userId)
    const allowed = new Set(((links ?? []) as { child_id: string }[]).map((l) => l.child_id))

    for (const entry of entries!) {
      if (!allowed.has(entry.childId)) {
        return NextResponse.json(
          { error: '許可されていないお子さまが含まれています' },
          { status: 403 }
        )
      }
    }

    const childIds = entries!.map((e) => e.childId)

    // 送迎の場所は、その児童の選択肢（学校・登録住所）に無いものを受け付けない。
    // 他人の住所IDや削除済みの住所を指定されると送迎先が実在しなくなるため
    const places = await loadTransportPlaces(adminClient, childIds)
    const badPlace = validateTransportPlaces(places, entries!)
    if (badPlace) return NextResponse.json({ error: badPlace }, { status: 400 })

    // 施設がお休みの日は受け付けない。画面では選べないようにしているが、
    // 休業日が後から登録されることもあるので保存の直前にも確かめる
    const months = [...new Set(targetDates.map((d) => d.slice(0, 7)))]
    const closureLists = await Promise.all(
      months.map((m) => {
        const [y, mm] = m.split('-').map(Number)
        return loadFacilityClosures(adminClient, childIds, y, mm)
      })
    )
    const closureByDate = new Map(closureLists.flat().map((c) => [c.date, c.title]))

    // 申込を締め切った月に新しい日を足すことはできない（利用時間などの変更は通す）。
    // キャンセルは、もともと予定がある日にしか送れない
    const deadline = await loadReservationDeadline(adminClient, childIds)
    const targetErrors = await validateContactTargets(
      adminClient,
      targetDates,
      entries!,
      deadline
    )

    const skipped: { date: string; reason: string }[] = []
    const savable: string[] = []
    for (const d of targetDates) {
      const closure = closureByDate.get(d)
      if (closure) {
        skipped.push({ date: d, reason: `施設がお休みです（${closure}）` })
        continue
      }
      const reason = targetErrors.get(d)
      if (reason) {
        skipped.push({ date: d, reason })
        continue
      }
      savable.push(d)
    }

    // 1日だけ送ったときは、これまでどおり理由をそのままエラーとして返す
    if (savable.length === 0) {
      return NextResponse.json(
        {
          error:
            targetDates.length === 1
              ? skipped[0].reason
              : 'お選びいただいた日はすべて申し込めませんでした',
          skipped,
        },
        { status: 400 }
      )
    }

    const result = await saveUsageContactsForDates(adminClient, savable, entries!)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ ok: true, savedDates: savable, skipped })
  } catch (err) {
    console.error('[parent/usage-contacts]', err)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
