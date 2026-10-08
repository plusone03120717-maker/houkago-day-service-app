-- 児童発達支援の児童を「プラスワン1」（放デイ）から「児童発達支援」ユニットへ移す。
--
-- 児発の児童（children.service_type = 'development_support'）がプラスワン1に所属していたため、
-- 国保連請求が放デイのサービスコード・単位数で計算されていた（8月・9月分）。
-- 所属と、ユニットにひもづく記録（出席・利用予定・利用計画・連絡帳・請求の手入力・送迎）を移し、
-- 児発ユニットで請求を計算できるようにする。普段の画面はユニットで分けずに表示する（別コミット）。
-- あわせて、受給者証のサービス種別が「放課後等デイサービス」のままだった児発の児童を直す。
--
-- 移したあと、国保連請求で「出席実績から再集計」を児童発達支援・プラスワン1の両方で実行すること。

DO $$
DECLARE
  p1 CONSTANT uuid := 'c0000000-0000-0000-0000-000000000001'; -- プラスワン1（放デイ）
  jh CONSTANT uuid := '25b03ef1-3cf4-411d-82ab-902d30f1c0e2'; -- 児童発達支援
  kid_count int;
  unmapped int;
BEGIN
  CREATE TEMP TABLE dev_kids ON COMMIT DROP AS
  SELECT cu.child_id
  FROM children_units cu
  JOIN children c ON c.id = cu.child_id
  WHERE cu.unit_id = p1
    AND c.service_type = 'development_support';

  SELECT count(*) INTO kid_count FROM dev_kids;
  RAISE NOTICE '移す児童: % 名', kid_count;
  IF kid_count = 0 THEN
    RETURN;
  END IF;

  -- 児発ユニットに保険外の項目（おやつ・学習教材など）がなければプラスワン1から写す
  INSERT INTO billing_service_items (unit_id, name, category, trigger_field, billing_code, unit_count, is_active, sort_order)
  SELECT jh, s.name, s.category, s.trigger_field, s.billing_code, s.unit_count, s.is_active, s.sort_order
  FROM billing_service_items s
  WHERE s.unit_id = p1
    AND s.category = '保険外'
    AND s.is_active
    AND NOT EXISTS (
      SELECT 1 FROM billing_service_items t WHERE t.unit_id = jh AND t.name = s.name
    );

  -- 請求の手入力（チェック・請求用時刻）。項目は児発ユニットの同じ種類の項目に付け替える
  -- （保険外は名前、それ以外は trigger_field で対応させる）
  CREATE TEMP TABLE item_map ON COMMIT DROP AS
  SELECT DISTINCT ON (src.id) src.id AS src_id, dst.id AS dst_id
  FROM billing_service_items src
  JOIN billing_service_items dst
    ON dst.unit_id = jh
   AND dst.is_active
   AND (
     (src.category = '保険外' AND dst.name = src.name)
     OR (src.category <> '保険外' AND dst.category <> '保険外' AND dst.trigger_field = src.trigger_field)
   )
  WHERE src.unit_id = p1
  ORDER BY src.id, dst.sort_order;

  SELECT count(*) INTO unmapped
  FROM billing_daily_records r
  WHERE r.unit_id = p1
    AND r.child_id IN (SELECT child_id FROM dev_kids)
    AND r.service_item_id IS NOT NULL
    AND r.service_item_id NOT IN (SELECT src_id FROM item_map);
  IF unmapped > 0 THEN
    RAISE EXCEPTION '児発ユニットに対応する請求項目がない手入力が % 件あります', unmapped;
  END IF;

  UPDATE billing_daily_records r
  SET unit_id = jh,
      service_item_id = COALESCE((SELECT m.dst_id FROM item_map m WHERE m.src_id = r.service_item_id), r.service_item_id)
  WHERE r.unit_id = p1
    AND r.child_id IN (SELECT child_id FROM dev_kids);

  -- 出席・利用予定・利用計画・連絡帳
  UPDATE daily_attendance SET unit_id = jh
  WHERE unit_id = p1 AND child_id IN (SELECT child_id FROM dev_kids);

  UPDATE usage_reservations SET unit_id = jh
  WHERE unit_id = p1 AND child_id IN (SELECT child_id FROM dev_kids);

  UPDATE usage_plans SET unit_id = jh
  WHERE unit_id = p1 AND child_id IN (SELECT child_id FROM dev_kids);

  UPDATE contact_notes SET unit_id = jh
  WHERE unit_id = p1 AND child_id IN (SELECT child_id FROM dev_kids);

  -- 送迎: 児童の送迎明細を、同じ日・方向・出発時刻の児発ユニットの送迎スケジュールへ付け替える
  -- （送迎画面は全ユニットをまとめて表示し、便もユニットをまたいでまとめる）
  INSERT INTO transport_schedules (unit_id, date, direction, departure_time, route_order)
  SELECT DISTINCT jh, s.date, s.direction, s.departure_time, '{}'::integer[]
  FROM transport_details d
  JOIN transport_schedules s ON s.id = d.schedule_id
  WHERE s.unit_id = p1
    AND d.child_id IN (SELECT child_id FROM dev_kids)
  ON CONFLICT ON CONSTRAINT transport_schedules_unit_date_direction_time_key DO NOTHING;

  UPDATE transport_details d
  SET schedule_id = js.id
  FROM transport_schedules s, transport_schedules js
  WHERE d.schedule_id = s.id
    AND s.unit_id = p1
    AND d.child_id IN (SELECT child_id FROM dev_kids)
    AND js.unit_id = jh
    AND js.date = s.date
    AND js.direction = s.direction
    AND js.departure_time IS NOT DISTINCT FROM s.departure_time;

  -- 所属
  UPDATE children_units SET unit_id = jh
  WHERE unit_id = p1 AND child_id IN (SELECT child_id FROM dev_kids);

  -- 受給者証のサービス種別（未就学の児発の児童が「放課後等デイサービス」のままだった）
  UPDATE benefit_certificates SET service_type = 'development_support'
  WHERE child_id IN (SELECT child_id FROM dev_kids)
    AND service_type = 'afterschool';

  -- プラスワン1で放デイとして計算された請求明細は誤りなので消す（確定済みも含む）。
  -- 児発ユニットで「出席実績から再集計」すると作り直される
  DELETE FROM billing_details bd
  USING billing_monthly bm
  WHERE bd.billing_monthly_id = bm.id
    AND bm.unit_id = p1
    AND bd.child_id IN (SELECT child_id FROM dev_kids);
END $$;
