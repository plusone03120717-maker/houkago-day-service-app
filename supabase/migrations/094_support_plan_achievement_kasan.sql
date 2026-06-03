-- 各領域の達成時期・加算カラムを追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS support_achievement_health_life            TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_movement_sensory       TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_cognition_behavior     TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_language_communication TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_social_relationships   TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_transition             TEXT,
  ADD COLUMN IF NOT EXISTS support_achievement_family                 TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_health_life                  TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_movement_sensory             TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_cognition_behavior           TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_language_communication       TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_social_relationships         TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_transition                   TEXT,
  ADD COLUMN IF NOT EXISTS support_kasan_family                       TEXT;
