-- 国保連サービスコードの初期登録（ぷらすわん「プラスワン1」ユニット・定員10人以下）
--
-- 出典は事業所の「放課後等デイサービス 実績記録票 算定時間数・延長支援加算 入力マニュアル
-- （令和6年度改定対応版）」。マニュアルに記載があるコード・単位数だけを入れる。
--
--   算定1（30分以上〜1時間30分以下）  放デイ411  63H574
--   算定2（1時間30分超〜3時間以下）    放デイ412  63H592
--   算定3（3時間超〜5時間以下）        放デイ412  63H592 ※算定2と同じコード
--   算定4（5時間超・学校休業日のみ）    放デイ413  63H5A4
--   延長支援加算111（30分以上1時間未満）  636301   61単位
--   延長支援加算112（1時間以上2時間未満） 636302   92単位
--   延長支援加算113（2時間以上）          636303  123単位
--
-- 基本報酬の単位数はマニュアルに記載がないため 0（未設定）のまま。
-- 設定 → 国保連サービスコード・単位数設定 から単位数表の値を入力すること。
-- 他のユニット（プログラミング・英会話・プラスワン2＝定員20人）は定員規模が異なり
-- サービスコードも変わるため、ここでは登録しない。

-- 既に人が入力した値は上書きしない（コードが未設定の行だけ埋める）
INSERT INTO billing_basic_rates (unit_id, service_form_type, billing_category, unit_count, billing_code)
SELECT u.id, v.form, v.category, 0, v.code
FROM units u
CROSS JOIN (VALUES
  (1, 1, '63H574'),  -- 平日・算定1
  (1, 2, '63H592'),  -- 平日・算定2
  (1, 3, '63H592'),  -- 平日・算定3（5時間超も算定3）
  (2, 1, '63H574'),  -- 休業日・算定1
  (2, 2, '63H592'),  -- 休業日・算定2
  (2, 3, '63H592'),  -- 休業日・算定3
  (2, 4, '63H5A4')   -- 休業日・算定4
) AS v(form, category, code)
WHERE u.id = 'c0000000-0000-0000-0000-000000000001'
ON CONFLICT (unit_id, service_form_type, billing_category) DO UPDATE
  SET billing_code = EXCLUDED.billing_code
  WHERE billing_basic_rates.billing_code IS NULL;

INSERT INTO billing_extension_rates (unit_id, extension_level, unit_count, billing_code)
SELECT u.id, v.level, v.units, v.code
FROM units u
CROSS JOIN (VALUES
  (1,  61, '636301'),
  (2,  92, '636302'),
  (3, 123, '636303')
) AS v(level, units, code)
WHERE u.id = 'c0000000-0000-0000-0000-000000000001'
ON CONFLICT (unit_id, extension_level) DO UPDATE
  SET unit_count = EXCLUDED.unit_count,
      billing_code = EXCLUDED.billing_code
  WHERE billing_extension_rates.unit_count = 0
    AND billing_extension_rates.billing_code IS NULL;
