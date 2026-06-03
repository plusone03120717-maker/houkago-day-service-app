-- 各領域の担当者・優先順位カラムを追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_assignee_health_life            TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_movement_sensory       TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_cognition_behavior     TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_social_relationships   TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_transition             TEXT,
  ADD COLUMN IF NOT EXISTS support_assignee_family                 TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_health_life            TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_movement_sensory       TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_cognition_behavior     TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_social_relationships   TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_transition             TEXT,
  ADD COLUMN IF NOT EXISTS support_priority_family                 TEXT;
