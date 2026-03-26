-- usersテーブルに役職配列を追加（roleはRLS/認証用に維持）
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_titles TEXT[] DEFAULT '{}';

-- staff_membersに役職配列を追加
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT '{}';

-- 既存データを移行
UPDATE staff_members
  SET roles = ARRAY[role]
  WHERE role IS NOT NULL AND role <> '';
