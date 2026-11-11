-- 180: スタッフ申請・保護者申請を「だれが・いつ」確認（承認・非承認）したかを残す（2026-11-12）
--
-- これまでは is_new を false にするだけで、処理した人と時刻が残らなかった。
-- 承認の履歴画面（/staff-requests/history・/parent-contacts/history）で見せるために列を足す。
-- 足すのは空でよい列だけ。いまあるデータ・画面の動きは変わらない。
-- この日より前に処理した分は、だれが・いつが空のまま（履歴には「記録なし」と出る）。

ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE paid_leave_usages
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN parent_attendance_contacts.reviewed_at IS
  'スタッフが承認・非承認・確認済みにした時刻。保護者が出し直すと空に戻る';
COMMENT ON COLUMN parent_attendance_contacts.reviewed_by IS '上の操作をしたスタッフ（users.id）';
COMMENT ON COLUMN overtime_requests.reviewed_at IS '管理者が「確認済み」にした時刻';
COMMENT ON COLUMN paid_leave_usages.reviewed_at IS '管理者が「確認済み」にした時刻';
COMMENT ON COLUMN time_records.reviewed_at IS '中抜け（break_start）を管理者が「確認済み」にした時刻';
