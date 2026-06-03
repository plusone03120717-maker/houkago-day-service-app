-- 各領域の評価カラムを追加（2枚目の評価シート用）
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_evaluation_health_life            TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_movement_sensory       TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_cognition_behavior     TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_social_relationships   TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_transition             TEXT,
  ADD COLUMN IF NOT EXISTS support_evaluation_family                 TEXT;
