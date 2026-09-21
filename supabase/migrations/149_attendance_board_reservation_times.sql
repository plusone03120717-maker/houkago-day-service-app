-- 出席管理の一括取得（get_attendance_board）に、その日の利用予定の送迎時刻を足す。
--
-- 出席管理の送迎欄の初期値は「特定日上書き > 曜日別設定 > 利用計画」だけを見ていた。
-- 保護者の利用連絡を承認した日は、その日限りの利用予定（usage_reservations）に
-- 送迎時刻が入るだけなので、毎週の利用計画が無い児童は名前だけ出て時刻が
-- ずっと空欄になっていた。時刻を判断できるよう、予約の transport_type と
-- pickup_time / dropoff_time を返すようにする。
--
-- 関数の中身は 124 と同じで、reservations の組み立てに3項目を足しただけ。

CREATE OR REPLACE FUNCTION public.get_attendance_board(
  p_unit_id uuid DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_unit_id   uuid;
  v_dow       int  := EXTRACT(DOW FROM p_date)::int;  -- 0=日曜（JSの getDay() と同じ）
  v_prev_from date := p_date - 45;
  v_plan_ids  uuid[];
  v_child_ids uuid[];
  v_result    jsonb;
BEGIN
  -- ユニット未指定なら名前順の先頭（アプリ側の units[0] と同じ挙動）
  v_unit_id := COALESCE(p_unit_id, (SELECT id FROM units ORDER BY name LIMIT 1));

  -- 曜日別設定・特定日上書きの取得対象。
  -- アプリ側は「日付・曜日で絞り込んだ計画」のIDだけを使うが、ここでは
  -- 有効な計画すべてを対象にする。余分な行が返ってもアプリ側は plan_id で
  -- 引くだけなので無害で、逆に取りこぼしが起きない。
  SELECT array_agg(id) INTO v_plan_ids
  FROM usage_plans
  WHERE unit_id = v_unit_id AND is_active = true;

  -- 前回コピー用データの対象児童。アプリ側が実際に使う集合の上位集合になるよう、
  -- 予約 / 当日該当する利用計画 / 出欠記録 の和集合を取る。
  SELECT array_agg(DISTINCT cid) INTO v_child_ids
  FROM (
    SELECT child_id AS cid
      FROM usage_reservations
     WHERE unit_id = v_unit_id
       AND date = p_date
       AND status IN ('confirmed', 'reserved', 'cancel_waiting')
    UNION
    SELECT child_id
      FROM usage_plans
     WHERE unit_id = v_unit_id
       AND is_active = true
       AND start_date <= p_date
       AND (end_date IS NULL OR end_date >= p_date)
       AND v_dow = ANY(day_of_week)
    UNION
    SELECT child_id
      FROM daily_attendance
     WHERE unit_id = v_unit_id AND date = p_date
  ) t;

  SELECT jsonb_build_object(

    'selected_unit_id', v_unit_id,

    -- ── マスタ ──
    'units', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           u.id,
               'name',         u.name,
               'service_type', u.service_type,
               'capacity',     u.capacity,
               'facilities',   CASE WHEN f.id IS NULL THEN NULL
                                    ELSE jsonb_build_object('id', f.id, 'name', f.name) END
             ) ORDER BY u.name)
        FROM units u
        LEFT JOIN facilities f ON f.id = u.facility_id
    ), '[]'::jsonb),

    'staff_members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sm.id, 'name', sm.name) ORDER BY sm.name)
        FROM staff_members sm
    ), '[]'::jsonb),

    'vehicles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tv.id, 'name', tv.name) ORDER BY tv.name)
        FROM transport_vehicles tv
    ), '[]'::jsonb),

    -- 'HH:MM' 形式。未設定ならアプリ側で '16:30' にフォールバックする
    'default_service_end_time', (
      SELECT to_char(
               (SELECT ns.default_service_end_time
                  FROM notification_settings ns
                 WHERE ns.facility_id = fa.id
                 LIMIT 1),
               'HH24:MI')
        FROM facilities fa
       LIMIT 1
    ),

    -- ── 当日分 ──
    'reservations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           r.id,
               'child_id',     r.child_id,
               'date',         r.date,
               'status',       r.status,
               'requested_by', r.requested_by,
               -- 送迎の時刻。保護者の利用連絡を承認した日は、毎週の利用計画が
               -- 無くてもここに送迎時刻が入る（出席管理の初期値に使う）
               'transport_type', r.transport_type,
               'pickup_time',    r.pickup_time,
               'dropoff_time',   r.dropoff_time,
               'children',     CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
                                 'id',            c.id,
                                 'name',          c.name,
                                 'name_kana',     c.name_kana,
                                 'photo_url',     c.photo_url,
                                 'allergy_info',  c.allergy_info,
                                 'medical_info',  c.medical_info) END
             ))
        FROM usage_reservations r
        LEFT JOIN children c ON c.id = r.child_id
       WHERE r.unit_id = v_unit_id
         AND r.date = p_date
         AND r.status IN ('confirmed', 'reserved', 'cancel_waiting')
    ), '[]'::jsonb),

    -- 日付・曜日での絞り込みはアプリ側で行う（従来どおり）
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',                          p.id,
               'child_id',                    p.child_id,
               'start_date',                  p.start_date,
               'end_date',                    p.end_date,
               'day_of_week',                 p.day_of_week,
               'transport_type',              p.transport_type,
               'pickup_time',                 p.pickup_time,
               'dropoff_time',                p.dropoff_time,
               'service_start_time',          p.service_start_time,
               'service_end_time',            p.service_end_time,
               'daytime_support',             p.daytime_support,
               'daytime_support_start_time',  p.daytime_support_start_time,
               'daytime_support_end_time',    p.daytime_support_end_time,
               'children',                    CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
                                                'id',            c.id,
                                                'name',          c.name,
                                                'name_kana',     c.name_kana,
                                                'photo_url',     c.photo_url,
                                                'allergy_info',  c.allergy_info,
                                                'medical_info',  c.medical_info) END
             ))
        FROM usage_plans p
        LEFT JOIN children c ON c.id = p.child_id
       WHERE p.unit_id = v_unit_id AND p.is_active = true
    ), '[]'::jsonb),

    'attendances', COALESCE((
      SELECT jsonb_agg(to_jsonb(da))
        FROM daily_attendance da
       WHERE da.unit_id = v_unit_id AND da.date = p_date
    ), '[]'::jsonb),

    'day_settings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'plan_id',            d.plan_id,
               'transport_type',     d.transport_type,
               'pickup_time',        d.pickup_time,
               'dropoff_time',       d.dropoff_time,
               'service_start_time', d.service_start_time,
               'service_end_time',   d.service_end_time
             ))
        FROM usage_plan_day_settings d
       WHERE d.plan_id = ANY(v_plan_ids) AND d.day_of_week = v_dow
    ), '[]'::jsonb),

    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'plan_id',            o.plan_id,
               'date',               o.date,
               'transport_type',     o.transport_type,
               'pickup_time',        o.pickup_time,
               'dropoff_time',       o.dropoff_time,
               'service_start_time', o.service_start_time,
               'service_end_time',   o.service_end_time,
               'is_cancelled',       o.is_cancelled
             ))
        FROM usage_plan_date_overrides o
       WHERE o.plan_id = ANY(v_plan_ids) AND o.date = p_date
    ), '[]'::jsonb),

    -- 出欠記録がある児童の情報（予約・計画に無い児童の行を作るのに使う）
    'attendance_children', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',            c.id,
               'name',          c.name,
               'name_kana',     c.name_kana,
               'photo_url',     c.photo_url,
               'allergy_info',  c.allergy_info,
               'medical_info',  c.medical_info
             ))
        FROM children c
       WHERE c.id IN (SELECT da.child_id
                        FROM daily_attendance da
                       WHERE da.unit_id = v_unit_id AND da.date = p_date)
    ), '[]'::jsonb),

    -- ── 前回コピー用: 児童ごとに「送迎・時間の入力がある最新の出席日」1行だけ ──
    -- WHERE 句はアプリ側 hasAnyTransportInput() の忠実な移植
    'prev', COALESCE((
      SELECT jsonb_agg(to_jsonb(pv))
        FROM (
          SELECT DISTINCT ON (da.child_id)
                 da.child_id,
                 da.date,
                 da.basic_service,
                 da.service_start_time,
                 da.service_end_time,
                 da.check_in_time,
                 da.check_out_time,
                 da.daytime_support,
                 da.daytime_support_start_time,
                 da.daytime_support_end_time,
                 da.pickup_departure_time,
                 da.pickup_arrival_time,
                 da.pickup_driver_member_id,
                 da.pickup_vehicle_id,
                 da.dropoff_departure_time,
                 da.dropoff_arrival_time,
                 da.dropoff_driver_member_id,
                 da.dropoff_vehicle_id,
                 da.daytime_pickup_departure_time,
                 da.daytime_pickup_arrival_time,
                 da.daytime_pickup_driver_member_id,
                 da.daytime_pickup_vehicle_id,
                 da.daytime_dropoff_departure_time,
                 da.daytime_dropoff_arrival_time,
                 da.daytime_dropoff_driver_member_id,
                 da.daytime_dropoff_vehicle_id
            FROM daily_attendance da
           WHERE da.child_id = ANY(v_child_ids)
             AND da.status = 'attended'
             AND da.date >= v_prev_from
             AND da.date <  p_date
             AND (
                  (da.service_start_time     IS NOT NULL AND to_char(da.service_start_time,     'HH24:MI') <> '00:00')
               OR (da.pickup_departure_time  IS NOT NULL AND to_char(da.pickup_departure_time,  'HH24:MI') <> '00:00')
               OR (da.pickup_arrival_time    IS NOT NULL AND to_char(da.pickup_arrival_time,    'HH24:MI') <> '00:00')
               OR (da.dropoff_departure_time IS NOT NULL AND to_char(da.dropoff_departure_time, 'HH24:MI') <> '00:00')
               OR (da.dropoff_arrival_time   IS NOT NULL AND to_char(da.dropoff_arrival_time,   'HH24:MI') <> '00:00')
               OR da.pickup_driver_member_id  IS NOT NULL
               OR da.dropoff_driver_member_id IS NOT NULL
               OR da.daytime_support
             )
           ORDER BY da.child_id, da.date DESC
        ) pv
    ), '[]'::jsonb)

  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_attendance_board(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_attendance_board(uuid, date) TO authenticated;
