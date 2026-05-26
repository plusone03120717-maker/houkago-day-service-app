-- 既存のログインありスタッフ（admin/staff）に staff_members エントリを補完する
-- user_id が紐付いていないユーザーのみ対象（重複作成しない）

INSERT INTO staff_members (user_id, name, role, roles, line_user_id)
SELECT
  u.id                                           AS user_id,
  u.name                                         AS name,
  COALESCE(u.job_titles[1], 'staff')             AS role,
  COALESCE(u.job_titles, ARRAY[]::text[])        AS roles,
  u.line_user_id                                 AS line_user_id
FROM users u
WHERE u.role IN ('admin', 'staff')
  AND NOT EXISTS (
    SELECT 1 FROM staff_members sm WHERE sm.user_id = u.id
  );
