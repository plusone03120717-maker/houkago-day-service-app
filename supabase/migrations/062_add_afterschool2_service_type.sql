-- units.service_type に afterschool2 を追加
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_service_type_check;
ALTER TABLE units
  ADD CONSTRAINT units_service_type_check
    CHECK (service_type IN ('afterschool', 'afterschool2', 'development_support'));

-- children.service_type に afterschool2 を追加
ALTER TABLE children
  DROP CONSTRAINT IF EXISTS children_service_type_check;
ALTER TABLE children
  ADD CONSTRAINT children_service_type_check
    CHECK (service_type IN ('afterschool', 'afterschool2', 'development_support'));
