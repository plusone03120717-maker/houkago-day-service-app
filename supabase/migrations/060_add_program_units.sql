-- プログラミング・英会話ユニットを追加
INSERT INTO units (facility_id, name, service_type, capacity)
SELECT
  id,
  unnest(ARRAY['プログラミング', '英会話']),
  'afterschool',
  20
FROM facilities
ORDER BY created_at
LIMIT 1
ON CONFLICT DO NOTHING;
