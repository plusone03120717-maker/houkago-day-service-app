-- ユーザーテーブルにLINE User IDカラムを追加
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS line_user_id TEXT;
