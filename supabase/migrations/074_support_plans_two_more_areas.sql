-- support_plans に移行支援・家族支援カラムを追加

ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_transition TEXT,
  ADD COLUMN IF NOT EXISTS support_family TEXT;
