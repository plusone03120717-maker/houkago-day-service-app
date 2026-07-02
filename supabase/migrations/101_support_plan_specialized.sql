-- 個別支援計画に専門的支援フィールドを追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_specialized TEXT;
