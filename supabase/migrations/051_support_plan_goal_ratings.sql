-- 個別支援計画の長期目標・短期目標に5段階評価を追加
ALTER TABLE support_plans
  ADD COLUMN IF NOT EXISTS long_term_goal_rating  smallint CHECK (long_term_goal_rating  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS short_term_goal_rating smallint CHECK (short_term_goal_rating BETWEEN 1 AND 5);
