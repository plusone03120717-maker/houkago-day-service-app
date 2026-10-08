-- 事業所の加算のサービスコード・単位数を、国保連の明細書（確認リスト）に合わせる。
-- 根拠: 令和8年9月分 明細書（確認リスト）
--   放デイ（小池凌生）: 児童指導員等加配加算211 634417 152単位 / 専門的支援体制加算11 634551 123単位
--   児発（三枝曜）    : 児童指導員等加配加算2211 614044 152単位 / 専門的支援体制加算211 614558 123単位
--                       福祉専門職員配置等加算Ⅲ 615491 6単位 / 処遇改善加算Ⅰロ 615639（15.8%）
-- プラスワン1 には児発のコード 614044 と延長支援加算113のコード 636303 が誤って入っていた（単位数は正しい）。

-- プラスワン1（放デイ）
UPDATE unit_addition_settings
SET billing_code = '634417', updated_at = NOW()
WHERE unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND addition_key = 'child_instructor_extra'
  AND billing_code = '614044';

UPDATE unit_addition_settings
SET billing_code = '634551', updated_at = NOW()
WHERE unit_id = 'c0000000-0000-0000-0000-000000000001'
  AND addition_key = 'specialized_support_system'
  AND billing_code = '636303';

-- 児童発達支援
UPDATE unit_addition_settings
SET option_value = 'fulltime_under5y', unit_count = 152, billing_code = '614044', updated_at = NOW()
WHERE unit_id = '25b03ef1-3cf4-411d-82ab-902d30f1c0e2'
  AND addition_key = 'child_instructor_extra';

UPDATE unit_addition_settings
SET option_value = 'yes', unit_count = 123, billing_code = '614558', updated_at = NOW()
WHERE unit_id = '25b03ef1-3cf4-411d-82ab-902d30f1c0e2'
  AND addition_key = 'specialized_support_system';

UPDATE unit_addition_settings
SET option_value = 'III', unit_count = 6, billing_code = '615491', updated_at = NOW()
WHERE unit_id = '25b03ef1-3cf4-411d-82ab-902d30f1c0e2'
  AND addition_key = 'welfare_specialist';
