-- support_plans に家族の意向・支援の方針カラムを追加

ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS family_wishes TEXT,
  ADD COLUMN IF NOT EXISTS support_policy TEXT;
