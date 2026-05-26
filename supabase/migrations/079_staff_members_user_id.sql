-- staff_members テーブルに user_id カラムを追加（users テーブルとのリンク）
-- ログインあり(admin/staff)スタッフも staff_members に登録できるようにする

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- user_id の一意制約（NULLは複数許容）
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_user_id_unique
  ON staff_members(user_id)
  WHERE user_id IS NOT NULL;
