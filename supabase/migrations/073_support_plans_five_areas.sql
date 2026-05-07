-- support_plans に法定5領域の支援内容カラムを追加
-- 従来の support_content は互換性のために残す

ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_health_life TEXT,
  ADD COLUMN IF NOT EXISTS support_movement_sensory TEXT,
  ADD COLUMN IF NOT EXISTS support_cognition_behavior TEXT,
  ADD COLUMN IF NOT EXISTS support_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_social_relationships TEXT;
