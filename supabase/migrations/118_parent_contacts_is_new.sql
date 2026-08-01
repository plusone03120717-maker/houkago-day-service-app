-- 保護者の利用連絡に「未確認」フラグを追加し、ヘッダーのベルバッジに件数を出せるようにする。
-- スタッフ申請（overtime_requests / paid_leave_usages / time_records）と同じ is_new パターン。
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT true;

-- 既存データは確認済み扱いにする（過去分がいきなりバッジに出ないように）
UPDATE parent_attendance_contacts SET is_new = false WHERE is_new = true;

-- 未確認件数の集計を高速化
CREATE INDEX IF NOT EXISTS idx_parent_contacts_is_new
  ON parent_attendance_contacts (is_new) WHERE is_new = true;

COMMENT ON COLUMN parent_attendance_contacts.is_new IS
  'true=スタッフ未確認（ベルバッジに計上）。確認済みボタンで false になる。保護者が再送信すると true に戻る';
