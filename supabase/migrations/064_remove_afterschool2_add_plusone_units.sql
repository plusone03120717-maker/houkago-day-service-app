-- children.service_type から afterschool2 を削除
UPDATE children SET service_type = NULL WHERE service_type = 'afterschool2';

ALTER TABLE children
  DROP CONSTRAINT IF EXISTS children_service_type_check;
ALTER TABLE children
  ADD CONSTRAINT children_service_type_check
    CHECK (service_type IN ('afterschool', 'development_support'));

-- units.service_type から afterschool2 を削除
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_service_type_check;
ALTER TABLE units
  ADD CONSTRAINT units_service_type_check
    CHECK (service_type IN ('afterschool', 'development_support'));

-- プラスワン1・プラスワン2ユニットを追加
INSERT INTO units (facility_id, name, service_type, capacity)
SELECT id, 'プラスワン1', 'afterschool', 20
FROM facilities ORDER BY created_at LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO units (facility_id, name, service_type, capacity)
SELECT id, 'プラスワン2', 'afterschool', 20
FROM facilities ORDER BY created_at LIMIT 1
ON CONFLICT DO NOTHING;
