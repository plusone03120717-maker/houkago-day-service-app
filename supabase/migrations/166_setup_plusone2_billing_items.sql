-- プラスワン2の国保連請求の設定を、プラスワン1と同じ内容で補う。
--
-- プラスワン2はユニット作成時にサービス項目の標準セットが入らず、
-- 「放デイ基本報酬」「日中一時支援」「送迎加算」の項目と、基本報酬・延長加算の単位数がなかった。
-- そのため9月分の再集計が全員0日・0円になり、日中一時も月次サービス実績・保護者請求に出なかった。
-- 施設から「定員10名・基本報酬はプラスワン1と同じ」と確認済み。
-- 体制加算（unit_addition_settings）はユニットごとに違うので触らない（プラスワン2は施設側で入力済み）。

-- 定員（20名で登録されていた）
UPDATE units SET capacity = 10
WHERE id = '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd';

-- サービス項目: プラスワン2にない種類だけ、プラスワン1から写す
INSERT INTO billing_service_items (unit_id, name, category, trigger_field, billing_code, unit_count, is_active, sort_order)
SELECT '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd', p1.name, p1.category, p1.trigger_field, p1.billing_code, p1.unit_count, true, p1.sort_order
FROM billing_service_items p1
WHERE p1.unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND p1.is_active
  AND p1.trigger_field IN ('basic', 'transport_pickup', 'transport_dropoff', 'daytime_support', 'daytime_pickup', 'daytime_dropoff')
  AND NOT EXISTS (
    SELECT 1 FROM billing_service_items p2
    WHERE p2.unit_id = '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd'
      AND p2.trigger_field = p1.trigger_field
  );

-- 欠席時対応加算の単位数（プラスワン2は0単位のままだった）
UPDATE billing_service_items p2
SET unit_count = p1.unit_count, billing_code = COALESCE(p2.billing_code, p1.billing_code)
FROM billing_service_items p1
WHERE p2.unit_id = '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd'
  AND p1.unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND p2.trigger_field = 'absent'
  AND p1.trigger_field = 'absent'
  AND p1.is_active
  AND p2.unit_count = 0;

-- 基本報酬の単位数
INSERT INTO billing_basic_rates (unit_id, service_form_type, billing_category, unit_count, billing_code)
SELECT '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd', p1.service_form_type, p1.billing_category, p1.unit_count, p1.billing_code
FROM billing_basic_rates p1
WHERE p1.unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM billing_basic_rates p2
    WHERE p2.unit_id = '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd'
      AND p2.service_form_type = p1.service_form_type
      AND p2.billing_category = p1.billing_category
  );

-- 延長加算の単位数
INSERT INTO billing_extension_rates (unit_id, extension_level, unit_count, billing_code)
SELECT '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd', p1.extension_level, p1.unit_count, p1.billing_code
FROM billing_extension_rates p1
WHERE p1.unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM billing_extension_rates p2
    WHERE p2.unit_id = '2f2a468a-2c02-4f4c-af6f-1bb7db60e0fd'
      AND p2.extension_level = p1.extension_level
  );
