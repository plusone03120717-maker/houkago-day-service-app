-- 保護者の利用連絡のうち「利用（予約）」については、スタッフが承認/非承認を記録できるようにする。
-- お休みの連絡は承認の対象外で、従来どおり is_new の確認済み操作のみ行う。
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN parent_attendance_contacts.approval_status IS
  'pending=未承認 / approved=承認 / rejected=非承認。status=attending のときのみ意味を持つ。保護者が再送信すると pending に戻る';

-- 承認待ちの抽出を高速化
CREATE INDEX IF NOT EXISTS idx_parent_contacts_approval_pending
  ON parent_attendance_contacts (approval_status) WHERE approval_status = 'pending';
