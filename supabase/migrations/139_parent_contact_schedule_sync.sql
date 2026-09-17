-- 保護者の利用連絡（LINE）を、スタッフの承認・確認操作で実際の予定へ反映できるようにする。
--
-- これまで parent_attendance_contacts は「保護者からの申告」を溜めるだけで、
-- 出席管理・利用状況・送迎・請求が見ている usage_reservations / daily_attendance とは
-- 完全に分断されていた。承認してもスタッフが利用状況画面で手入力し直す必要があり、
-- 二度手間になっていた。
--
-- ここで追加する3列は「どこへ反映したか」の控えで、非承認・未承認に戻したときに
-- 反映を正確に取り消すために使う。
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_reservation_id uuid REFERENCES usage_reservations(id) ON DELETE SET NULL;

COMMENT ON COLUMN parent_attendance_contacts.applied_at IS
  '予定（usage_reservations / daily_attendance）へ反映した時刻。null＝未反映';
COMMENT ON COLUMN parent_attendance_contacts.applied_unit_id IS
  '反映先のユニット。取り消し時に同じユニットの行を探すために使う';
COMMENT ON COLUMN parent_attendance_contacts.applied_reservation_id IS
  'この連絡の反映で新しく作った予約のID。既存の予約を更新しただけの場合は null のままにして、'
  '取り消してもスタッフが自分で入れた予約を消さないようにする';

-- 反映済みの連絡を日付から引くのを速くする
CREATE INDEX IF NOT EXISTS idx_parent_contacts_applied
  ON parent_attendance_contacts (applied_at) WHERE applied_at IS NOT NULL;
