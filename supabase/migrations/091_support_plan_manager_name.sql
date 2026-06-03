-- 児童発達支援管理責任者氏名を個別支援計画に記録
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS manager_name TEXT;
