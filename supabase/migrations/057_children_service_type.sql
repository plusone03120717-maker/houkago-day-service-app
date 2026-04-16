-- 子どものサービス種別（放課後等デイサービス or 児童発達支援）
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS service_type TEXT CHECK (service_type IN ('afterschool', 'development_support'));
