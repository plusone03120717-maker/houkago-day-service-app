-- 既存ユニットのうち billing_service_items は持つが daytime_support トリガー項目がないものに追加
INSERT INTO billing_service_items (unit_id, name, category, trigger_field, is_active, sort_order)
SELECT
  u.unit_id,
  '日中一時支援',
  '基本',
  'daytime_support',
  true,
  COALESCE((SELECT MAX(sort_order) FROM billing_service_items WHERE unit_id = u.unit_id), 0) + 1
FROM (
  SELECT DISTINCT unit_id FROM billing_service_items
) u
WHERE NOT EXISTS (
  SELECT 1 FROM billing_service_items
  WHERE unit_id = u.unit_id AND trigger_field = 'daytime_support'
);
