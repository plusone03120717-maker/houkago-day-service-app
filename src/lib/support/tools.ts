import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * サポートボットが実データを確認するための道具一式。
 *
 * 【安全設計】
 * 1. すべて参照専用。書き込み・削除を行うツールは存在しない。
 *    ボットが誤ってデータを壊すことが構造的に起こらないようにするため。
 * 2. ここに渡ってくる SupabaseClient は必ず「ログイン中の職員のセッション」で
 *    作ったものにすること（service_role を渡してはいけない）。RLS がそのまま
 *    効くので、ボットが見られる範囲＝その職員が画面で見られる範囲になる。
 * 3. 児童の住所・医療情報・アレルギー・緊急連絡先・備考は取得しない。
 *    出席や送迎の入力ミスを調べるのに不要で、外部APIへ送る理由がないため。
 */

/** 1つのツール結果の上限。長大なJSONで入力トークンを食い潰さないため */
const MAX_RESULT_CHARS = 6000

export const SUPPORT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_children',
    description:
      '児童を名前（漢字・かな）の一部で検索し、児童IDを得る。' +
      '他のツールは児童IDを必要とするので、まずこれで特定する。' +
      '同姓や似た名前が複数出た場合は、勝手に決めずに職員に確認すること。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '氏名の一部。例：「山田」「たろう」' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_child_day',
    description:
      'ある児童の、ある1日の記録をまとめて取得する。' +
      '出席状況・提供時間・送迎の時刻・日中一時の記録に加えて、' +
      '「利用計画ではその日はどうなっているはずか」も返す。' +
      '「入力したのに反映されない」「予定と違う」の相談はまずこれを見ること。',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string', description: 'search_children で得た児童ID' },
        date: { type: 'string', description: 'YYYY-MM-DD 形式の日付' },
      },
      required: ['child_id', 'date'],
    },
  },
  {
    name: 'get_child_month',
    description:
      'ある児童の1か月分の出席状況と、受給者証の支給量を取得する。' +
      '「給付量が合わない」「利用日数がおかしい」「請求の日数が違う」の相談に使う。',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string', description: 'search_children で得た児童ID' },
        year_month: { type: 'string', description: 'YYYY-MM 形式の年月' },
      },
      required: ['child_id', 'year_month'],
    },
  },
  {
    name: 'get_change_history',
    description:
      '記録が「いつ・誰に・どこを」書き換えられたかの履歴を取得する。' +
      '「入力したはずの値が変わっている」「勝手に消えた」の相談で決定的な証拠になる。' +
      '日付を指定するとその日の記録に関する変更だけに絞れる。',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string', description: 'search_children で得た児童ID' },
        date: {
          type: 'string',
          description: '任意。YYYY-MM-DD。指定するとその日付の記録の変更だけを返す',
        },
      },
      required: ['child_id'],
    },
  },
  {
    name: 'get_check_findings',
    description:
      '夜間バッチ（入力チェック）が検出した未対応の指摘を取得する。' +
      '職員が気づいた不整合が、すでにシステム側で検出済みかどうかを確認できる。',
    input_schema: {
      type: 'object',
      properties: {
        child_id: { type: 'string', description: '任意。指定するとその児童の指摘だけを返す' },
      },
      required: [],
    },
  },
  {
    name: 'get_transport_day',
    description:
      'ある日の送迎の便（お迎え・お送り）の一覧を取得する。' +
      '便ごとの出発時間・乗る児童・乗車場所が分かる。' +
      '「一覧に出てこない」「時間がおかしい」など送迎画面の相談に使う。',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD 形式の日付' },
        direction: {
          type: 'string',
          enum: ['pickup', 'dropoff'],
          description: '任意。pickup=お迎え、dropoff=お送り',
        },
      },
      required: ['date'],
    },
  },
]

const TRANSPORT_TYPE_LABELS: Record<string, string> = {
  none: 'なし',
  pickup_only: 'お迎えのみ',
  dropoff_only: 'お送りのみ',
  both: '往復',
}

const STATUS_LABELS: Record<string, string> = {
  attended: '出席',
  absent: '欠席',
  cancel_waiting: 'キャンセル待ち',
  scheduled: '利用予定',
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

/** 'YYYY-MM-DD' の曜日番号（0=日）。タイムゾーンの影響を受けないよう UTC で組む */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(last).padStart(2, '0')}` }
}

/**
 * ツールを実行して、Claude に返す文字列を作る。
 *
 * 例外は投げずに、必ず文字列として返す（ツール実行が落ちると会話全体が
 * 止まってしまうため）。データが無い場合も「無い」と分かる形で返す。
 */
export async function runSupportTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<string> {
  try {
    const result = await dispatch(name, input, supabase)
    const json = JSON.stringify(result, null, 1)
    return json.length > MAX_RESULT_CHARS
      ? json.slice(0, MAX_RESULT_CHARS) +
          '\n…（結果が長いため省略しました。日付や児童を絞って取得し直してください）'
      : json
  } catch (error) {
    console.error(`support tool ${name} failed:`, error)
    return JSON.stringify({
      エラー: 'データを取得できませんでした。職員に画面での確認をお願いしてください。',
    })
  }
}

async function dispatch(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<unknown> {
  switch (name) {
    case 'search_children':
      return searchChildren(supabase, String(input.query ?? ''))
    case 'get_child_day':
      return getChildDay(supabase, String(input.child_id), String(input.date))
    case 'get_child_month':
      return getChildMonth(supabase, String(input.child_id), String(input.year_month))
    case 'get_change_history':
      return getChangeHistory(
        supabase,
        String(input.child_id),
        input.date ? String(input.date) : null
      )
    case 'get_check_findings':
      return getCheckFindings(supabase, input.child_id ? String(input.child_id) : null)
    case 'get_transport_day':
      return getTransportDay(
        supabase,
        String(input.date),
        input.direction ? String(input.direction) : null
      )
    default:
      return { エラー: `未知のツール: ${name}` }
  }
}

// =====================================================
// 各ツールの実装（すべて参照のみ）
// =====================================================

async function searchChildren(supabase: SupabaseClient, query: string) {
  const q = query.trim()
  if (!q) return { 結果: '検索文字列が空です' }

  const { data } = await supabase
    .from('children')
    .select('id, name, name_kana, grade, school_name')
    .or(`name.ilike.%${q}%,name_kana.ilike.%${q}%`)
    .limit(10)

  const rows = data ?? []
  if (rows.length === 0) return { 結果: `「${q}」に一致する児童は見つかりませんでした` }
  return { 件数: rows.length, 児童: rows }
}

async function getChildDay(supabase: SupabaseClient, childId: string, date: string) {
  const dow = weekdayOf(date)

  const [{ data: child }, { data: attendance }, { data: plans }, { data: reservations }] =
    await Promise.all([
      supabase.from('children').select('id, name, name_kana').eq('id', childId).maybeSingle(),
      supabase.from('daily_attendance').select('*').eq('child_id', childId).eq('date', date),
      // 期間で絞り込まずに全件取る。「なぜ計画に入っていないのか」（期間外なのか
      // 曜日違いなのか）を説明できないと、職員の相談に答えられないため。
      supabase.from('usage_plans').select('*').eq('child_id', childId),
      supabase
        .from('usage_reservations')
        .select('status, requested_at')
        .eq('child_id', childId)
        .eq('date', date),
    ])

  if (!child) return { 結果: '該当する児童が見つかりません（権限がない可能性もあります）' }

  const allPlans = (plans ?? []) as Record<string, unknown>[]
  const inPeriod = (p: Record<string, unknown>) =>
    String(p.start_date) <= date && (!p.end_date || String(p.end_date) >= date)

  // その日に効いている計画だけに絞る（期間内・曜日が入っている・有効なもの）
  const activePlans = allPlans.filter(
    (p) =>
      p.is_active !== false &&
      inPeriod(p) &&
      Array.isArray(p.day_of_week) &&
      (p.day_of_week as number[]).includes(dow)
  )
  const planIds = activePlans.map((p: Record<string, unknown>) => p.id as string)

  const [{ data: daySettings }, { data: overrides }, transport] = await Promise.all([
    planIds.length
      ? supabase
          .from('usage_plan_day_settings')
          .select('*')
          .in('plan_id', planIds)
          .eq('day_of_week', dow)
      : Promise.resolve({ data: [] }),
    planIds.length
      ? supabase.from('usage_plan_date_overrides').select('*').in('plan_id', planIds).eq('date', date)
      : Promise.resolve({ data: [] }),
    getChildTransport(supabase, childId, date),
  ])

  return {
    児童: child,
    日付: `${date}（${WEEKDAY[dow]}曜）`,
    出席記録:
      (attendance ?? []).length === 0
        ? 'この日の記録は作られていません'
        : (attendance ?? []).map(summarizeAttendance),
    利用計画:
      activePlans.length === 0
        ? {
            結果: 'この日に有効な利用計画はありません',
            // 「なぜ入っていないのか」まで返さないと、職員は次の一手が分からない
            理由: allPlans.length === 0
              ? 'この児童には利用計画が1件も登録されていません'
              : allPlans.map((p) => ({
                  計画: p.name ?? p.id,
                  期間: `${p.start_date} 〜 ${p.end_date ?? '（終了日なし）'}`,
                  曜日: Array.isArray(p.day_of_week)
                    ? (p.day_of_week as number[]).map((d) => WEEKDAY[d]).join('・')
                    : '未設定',
                  該当しない理由:
                    p.is_active === false
                      ? '計画が無効になっている'
                      : !inPeriod(p)
                        ? '対象日が計画の期間外'
                        : `対象日の${WEEKDAY[dow]}曜が計画の曜日に含まれていない`,
                })),
          }
        : {
            件数: activePlans.length,
            注記:
              activePlans.length > 1
                ? '計画が複数重複しています。画面では開始日が新しい方が使われます'
                : undefined,
            計画: activePlans.map((p: Record<string, unknown>) => ({
              id: p.id,
              期間: `${p.start_date} 〜 ${p.end_date ?? '（終了日なし）'}`,
              曜日: (p.day_of_week as number[]).map((d) => WEEKDAY[d]).join('・'),
              送迎: TRANSPORT_TYPE_LABELS[String(p.transport_type)] ?? p.transport_type,
              迎え時間: p.pickup_time,
              送り時間: p.dropoff_time,
              提供開始: p.service_start_time,
              提供終了: p.service_end_time,
              日中一時: p.daytime_support,
            })),
          },
    曜日別設定: daySettings?.length ? daySettings : 'なし（計画の既定値を使用）',
    特定日の上書き: overrides?.length ? overrides : 'なし',
    予約: reservations?.length ? reservations : 'なし',
    送迎明細: transport,
    優先順位の説明:
      '送迎・時間の設定は「特定日の上書き ＞ 曜日別設定 ＞ 計画の既定値」の順に優先されます',
  }
}

/** その児童のその日の送迎明細（どの便に乗る予定か） */
async function getChildTransport(supabase: SupabaseClient, childId: string, date: string) {
  const { data: schedules } = await supabase
    .from('transport_schedules')
    .select('id, direction, departure_time')
    .eq('date', date)

  const ids = (schedules ?? []).map((s: Record<string, unknown>) => s.id as string)
  if (ids.length === 0) return 'この日の送迎便は登録されていません'

  const { data: details } = await supabase
    .from('transport_details')
    .select('schedule_id, pickup_location, status')
    .eq('child_id', childId)
    .in('schedule_id', ids)

  if (!details?.length) return 'この日の送迎一覧にこの児童は入っていません'

  return details.map((d: Record<string, unknown>) => {
    const s = (schedules ?? []).find(
      (x: Record<string, unknown>) => x.id === d.schedule_id
    ) as Record<string, unknown> | undefined
    return {
      区分: s?.direction === 'pickup' ? 'お迎え' : 'お送り',
      便の出発時間: s?.departure_time,
      場所: d.pickup_location,
      状態: d.status,
    }
  })
}

async function getChildMonth(supabase: SupabaseClient, childId: string, yearMonth: string) {
  const { from, to } = monthRange(yearMonth)

  const [{ data: child }, { data: attendance }, { data: certs }] = await Promise.all([
    supabase.from('children').select('id, name').eq('id', childId).maybeSingle(),
    supabase
      .from('daily_attendance')
      .select(
        'date, status, basic_service, daytime_support, check_in_time, check_out_time, service_start_time, service_end_time'
      )
      .eq('child_id', childId)
      .gte('date', from)
      .lte('date', to)
      .order('date'),
    supabase
      .from('benefit_certificates')
      .select('service_type, start_date, end_date, max_days_per_month, copay_limit')
      .eq('child_id', childId)
      .lte('start_date', to)
      .gte('end_date', from),
  ])

  if (!child) return { 結果: '該当する児童が見つかりません（権限がない可能性もあります）' }

  const rows = attendance ?? []
  const attended = rows.filter((r: Record<string, unknown>) => r.status === 'attended')

  return {
    児童: child,
    対象月: yearMonth,
    出席日数: attended.length,
    欠席日数: rows.filter((r: Record<string, unknown>) => r.status === 'absent').length,
    利用予定のまま確定していない日:
      rows.filter((r: Record<string, unknown>) => r.status === 'scheduled').length,
    日中一時の日数: attended.filter((r: Record<string, unknown>) => r.daytime_support).length,
    受給者証: certs?.length ? certs : '有効な受給者証が見つかりません（請求対象外になります）',
    日別: rows.map((r: Record<string, unknown>) => ({
      日: String(r.date).slice(8),
      状況: STATUS_LABELS[String(r.status)] ?? r.status,
      提供時間:
        r.service_start_time || r.service_end_time
          ? `${r.service_start_time ?? '未入力'}〜${r.service_end_time ?? '未入力'}`
          : '未入力',
      日中一時: r.daytime_support ? 'あり' : '',
    })),
  }
}

async function getChangeHistory(
  supabase: SupabaseClient,
  childId: string,
  date: string | null
) {
  let query = supabase
    .from('record_change_logs')
    .select('table_name, operation, changed_fields, old_data, new_data, record_date, changed_by, changed_at')
    .eq('child_id', childId)
    .order('changed_at', { ascending: false })
    .limit(20)

  if (date) query = query.eq('record_date', date)

  const { data } = await query
  const rows = data ?? []
  if (rows.length === 0) {
    return { 結果: date ? `${date} の記録に変更履歴はありません` : '変更履歴はありません' }
  }

  // 変更者のIDだけでは職員に伝わらないので名前に引き直す
  const userIds = [...new Set(rows.map((r: Record<string, unknown>) => r.changed_by).filter(Boolean))]
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, name').in('id', userIds as string[])
    : { data: [] }
  const names = new Map(
    ((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])
  )

  return {
    件数: rows.length,
    履歴: rows.map((r: Record<string, unknown>) => {
      const fields = (r.changed_fields as string[]) ?? []
      const oldData = (r.old_data as Record<string, unknown> | null) ?? {}
      const newData = (r.new_data as Record<string, unknown> | null) ?? {}
      return {
        日時: r.changed_at,
        対象: r.table_name,
        対象日: r.record_date,
        操作: r.operation,
        変更者: r.changed_by ? (names.get(r.changed_by as string) ?? '不明') : 'システム（バッチ等）',
        // 行まるごとではなく、実際に変わった項目だけを見せる
        変更内容: fields.map(
          (f) => `${fieldLabel(f)}: ${format(oldData[f], f)} → ${format(newData[f], f)}`
        ),
      }
    }),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DBの列名を、職員が画面で見ている言葉に直す。
 *
 * ここを英語のまま返すと、ボットが「dropoff_driver_member_id が変わっています」と
 * そのまま職員に伝えてしまう（実測で発生した）。プロンプトで禁じるより、
 * そもそも英語の列名を渡さない方が確実。
 */
const FIELD_LABELS: Record<string, string> = {
  status: '出席状況',
  basic_service: '放デイの提供有無',
  check_in_time: '登園時刻',
  check_out_time: '降園時刻',
  service_start_time: '提供開始時刻',
  service_end_time: '提供終了時刻',
  pickup_type: '送迎区分',
  pickup_departure_time: 'お迎えの出発時刻',
  pickup_arrival_time: 'お迎えの到着時刻',
  dropoff_departure_time: 'お送りの出発時刻',
  dropoff_arrival_time: 'お送りの到着時刻',
  pickup_driver_member_id: 'お迎えの担当者',
  pickup_vehicle_id: 'お迎えの車両',
  dropoff_driver_member_id: 'お送りの担当者',
  dropoff_vehicle_id: 'お送りの車両',
  daytime_support: '日中一時の利用',
  daytime_support_start_time: '日中一時の開始時刻',
  daytime_support_end_time: '日中一時の終了時刻',
  daytime_pickup_departure_time: '日中一時 お迎えの出発時刻',
  daytime_pickup_arrival_time: '日中一時 お迎えの到着時刻',
  daytime_dropoff_departure_time: '日中一時 お送りの出発時刻',
  daytime_dropoff_arrival_time: '日中一時 お送りの到着時刻',
  daytime_pickup_driver_member_id: '日中一時 お迎えの担当者',
  daytime_dropoff_driver_member_id: '日中一時 お送りの担当者',
  daytime_pickup_vehicle_id: '日中一時 お迎えの車両',
  daytime_dropoff_vehicle_id: '日中一時 お送りの車両',
  health_condition: '健康状態',
  unit_id: 'ユニット',
  date: '対象日',
  // 利用計画まわり
  name: '計画名',
  day_of_week: '曜日',
  start_date: '開始日',
  end_date: '終了日',
  is_active: '有効',
  transport_type: '送迎区分',
  pickup_time: 'お迎え時間',
  dropoff_time: 'お送り時間',
  pickup_location_type: 'お迎え場所',
  dropoff_location_type: 'お送り場所',
  // 送迎明細
  pickup_location: '乗車場所',
  sort_order: '並び順',
  trip_group_id: '便のまとまり',
}

/** 列ごとの値の言い換え（コード値のまま伝えても職員には通じない） */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: { ...STATUS_LABELS, scheduled: '利用予定', boarded: '乗車済み', arrived: '到着済み' },
  pickup_type: TRANSPORT_TYPE_LABELS,
  transport_type: TRANSPORT_TYPE_LABELS,
  pickup_location_type: { home: '自宅', school: '学校' },
  dropoff_location_type: { home: '自宅', school: '学校' },
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

function format(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === '') return '（空）'
  const text = String(value)
  // 生のUUIDをそのまま出すと、ボットが職員に意味のない文字列を読み上げてしまう
  if (UUID_RE.test(text)) return '（設定あり）'
  if (field && VALUE_LABELS[field]?.[text]) return VALUE_LABELS[field][text]
  if (typeof value === 'boolean') return value ? 'あり' : 'なし'
  return text
}

async function getCheckFindings(supabase: SupabaseClient, childId: string | null) {
  let query = supabase
    .from('anomaly_findings')
    .select('rule, severity, target_date, message, status, detected_at, children(name)')
    .eq('status', 'open')
    .order('target_date')
    .limit(20)

  if (childId) query = query.eq('child_id', childId)

  const { data } = await query
  const rows = data ?? []
  if (rows.length === 0) return { 結果: '未対応の指摘はありません' }
  return { 件数: rows.length, 指摘: rows }
}

async function getTransportDay(
  supabase: SupabaseClient,
  date: string,
  direction: string | null
) {
  let scheduleQuery = supabase
    .from('transport_schedules')
    .select('id, direction, departure_time')
    .eq('date', date)
  if (direction) scheduleQuery = scheduleQuery.eq('direction', direction)

  const { data: schedules } = await scheduleQuery
  const rows = schedules ?? []
  if (rows.length === 0) return { 結果: `${date} の送迎便は登録されていません` }

  const { data: details } = await supabase
    .from('transport_details')
    .select('schedule_id, pickup_location, status, sort_order, children(name)')
    .in(
      'schedule_id',
      rows.map((s: Record<string, unknown>) => s.id as string)
    )

  return {
    日付: date,
    便数: rows.length,
    便: rows.map((s: Record<string, unknown>) => ({
      区分: s.direction === 'pickup' ? 'お迎え' : 'お送り',
      出発時間: s.departure_time ?? '未設定',
      児童: (details ?? [])
        .filter((d: Record<string, unknown>) => d.schedule_id === s.id)
        .map((d: Record<string, unknown>) => ({
          名前: (d.children as { name: string } | null)?.name ?? '不明',
          場所: d.pickup_location,
          状態: d.status,
        })),
    })),
  }
}

function summarizeAttendance(row: Record<string, unknown>) {
  return {
    状況: STATUS_LABELS[String(row.status)] ?? row.status,
    放デイ提供: row.basic_service,
    提供時間: `${row.service_start_time ?? '未入力'}〜${row.service_end_time ?? '未入力'}`,
    登園: row.check_in_time ?? '未入力',
    降園: row.check_out_time ?? '未入力',
    迎え: `出発 ${row.pickup_departure_time ?? '未入力'} / 到着 ${row.pickup_arrival_time ?? '未入力'}`,
    送り: `出発 ${row.dropoff_departure_time ?? '未入力'} / 到着 ${row.dropoff_arrival_time ?? '未入力'}`,
    日中一時: row.daytime_support
      ? {
          利用: 'あり',
          時間: `${row.daytime_support_start_time ?? '未入力'}〜${row.daytime_support_end_time ?? '未入力'}`,
          迎え: `出発 ${row.daytime_pickup_departure_time ?? '未入力'} / 到着 ${row.daytime_pickup_arrival_time ?? '未入力'}`,
          送り: `出発 ${row.daytime_dropoff_departure_time ?? '未入力'} / 到着 ${row.daytime_dropoff_arrival_time ?? '未入力'}`,
        }
      : 'なし',
    最終更新: row.updated_at,
  }
}
