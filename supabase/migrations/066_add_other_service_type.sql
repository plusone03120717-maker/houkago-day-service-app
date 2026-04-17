-- children.service_type に other を追加
ALTER TABLE children
  DROP CONSTRAINT IF EXISTS children_service_type_check;
ALTER TABLE children
  ADD CONSTRAINT children_service_type_check
    CHECK (service_type IN ('afterschool', 'development_support', 'other'));
