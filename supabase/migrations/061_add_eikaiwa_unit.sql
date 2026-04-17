-- 英会話ユニットを追加（060でLIMIT 1により未挿入だったため再投入）
INSERT INTO units (facility_id, name, service_type, capacity)
SELECT id, '英会話', 'afterschool', 20
FROM facilities
ORDER BY created_at
LIMIT 1
ON CONFLICT DO NOTHING;
