-- 各領域の支援目標（具体的な到達目標）カラムを追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_goal_health_life            TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_movement_sensory       TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_cognition_behavior     TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_social_relationships   TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_transition             TEXT,
  ADD COLUMN IF NOT EXISTS support_goal_family                 TEXT;
