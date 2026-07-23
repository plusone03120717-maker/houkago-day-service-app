-- overtime_requests / paid_leave_usages / paid_leave_grants の
-- staff_id 外部キーを users(id) → staff_members(id) に変更する

-- ============================================================
-- overtime_requests
-- ============================================================
ALTER TABLE overtime_requests ADD COLUMN new_staff_id UUID;

UPDATE overtime_requests o
SET new_staff_id = sm.id
FROM staff_members sm
WHERE sm.user_id = o.staff_id;

-- マッピングできなかった行を削除（staff_membersレコードのない管理者など）
DELETE FROM overtime_requests WHERE new_staff_id IS NULL;

ALTER TABLE overtime_requests DROP CONSTRAINT IF EXISTS overtime_requests_staff_id_date_request_type_key;
ALTER TABLE overtime_requests DROP CONSTRAINT IF EXISTS overtime_requests_staff_id_fkey;
ALTER TABLE overtime_requests DROP COLUMN staff_id;
ALTER TABLE overtime_requests RENAME COLUMN new_staff_id TO staff_id;
ALTER TABLE overtime_requests ALTER COLUMN staff_id SET NOT NULL;
ALTER TABLE overtime_requests
  ADD CONSTRAINT overtime_requests_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE;
ALTER TABLE overtime_requests
  ADD CONSTRAINT overtime_requests_staff_id_date_request_type_key
  UNIQUE (staff_id, date, request_type);

-- ============================================================
-- paid_leave_usages
-- ============================================================
ALTER TABLE paid_leave_usages ADD COLUMN new_staff_id UUID;

UPDATE paid_leave_usages u
SET new_staff_id = sm.id
FROM staff_members sm
WHERE sm.user_id = u.staff_id;

DELETE FROM paid_leave_usages WHERE new_staff_id IS NULL;

ALTER TABLE paid_leave_usages DROP CONSTRAINT IF EXISTS paid_leave_usages_staff_id_date_key;
ALTER TABLE paid_leave_usages DROP CONSTRAINT IF EXISTS paid_leave_usages_staff_id_fkey;
ALTER TABLE paid_leave_usages DROP COLUMN staff_id;
ALTER TABLE paid_leave_usages RENAME COLUMN new_staff_id TO staff_id;
ALTER TABLE paid_leave_usages ALTER COLUMN staff_id SET NOT NULL;
ALTER TABLE paid_leave_usages
  ADD CONSTRAINT paid_leave_usages_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE;
ALTER TABLE paid_leave_usages
  ADD CONSTRAINT paid_leave_usages_staff_id_date_key
  UNIQUE (staff_id, date);

-- ============================================================
-- paid_leave_grants
-- ============================================================
ALTER TABLE paid_leave_grants ADD COLUMN new_staff_id UUID;

UPDATE paid_leave_grants g
SET new_staff_id = sm.id
FROM staff_members sm
WHERE sm.user_id = g.staff_id;

DELETE FROM paid_leave_grants WHERE new_staff_id IS NULL;

ALTER TABLE paid_leave_grants DROP CONSTRAINT IF EXISTS paid_leave_grants_staff_id_year_key;
ALTER TABLE paid_leave_grants DROP CONSTRAINT IF EXISTS paid_leave_grants_staff_id_fkey;
ALTER TABLE paid_leave_grants DROP COLUMN staff_id;
ALTER TABLE paid_leave_grants RENAME COLUMN new_staff_id TO staff_id;
ALTER TABLE paid_leave_grants ALTER COLUMN staff_id SET NOT NULL;
ALTER TABLE paid_leave_grants
  ADD CONSTRAINT paid_leave_grants_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES staff_members(id) ON DELETE CASCADE;
ALTER TABLE paid_leave_grants
  ADD CONSTRAINT paid_leave_grants_staff_id_year_key
  UNIQUE (staff_id, year);

-- インデックス再作成
DROP INDEX IF EXISTS idx_overtime_requests_staff_id;
CREATE INDEX idx_overtime_requests_staff_id ON overtime_requests(staff_id);
DROP INDEX IF EXISTS idx_paid_leave_usages_staff_id;
CREATE INDEX idx_paid_leave_usages_staff_id ON paid_leave_usages(staff_id);
