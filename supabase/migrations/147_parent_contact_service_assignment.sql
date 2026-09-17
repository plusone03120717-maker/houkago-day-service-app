-- 保護者はサービス区分（放デイ / 日中一時）を選ばない。
--
-- 日中一時支援を使えるかどうかは受給者証と支給量の残りで決まるもので、
-- 保護者はその判断材料を持っていない。これまでは保護者に二択で選ばせていたため、
-- 間違った区分で届いた連絡をスタッフが直す手間が出ていたうえ、
-- 同じ日に放デイと日中一時の両方を使う日（学校休業日など）は
-- unique (child_id, date) に阻まれて片方しか送れなかった。
--
-- これ以降 service_type は「保護者の申告」ではなく「施設が承認時に割り振った区分」を表す。
-- 両方使う日は 'both' とし、それぞれの時間を assigned_* に持つ。
-- 保護者が希望した利用時間（service_start_time / service_end_time）はそのまま残すので、
-- 「保護者が何を頼んだか」と「施設がどう割り振ったか」は後からでも見分けられる。

ALTER TABLE parent_attendance_contacts
  DROP CONSTRAINT IF EXISTS parent_attendance_contacts_service_type_check;

ALTER TABLE parent_attendance_contacts
  ADD CONSTRAINT parent_attendance_contacts_service_type_check
  CHECK (service_type IN ('regular', 'daytime_support', 'both'));

ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS assigned_service_start_time TIME,
  ADD COLUMN IF NOT EXISTS assigned_service_end_time   TIME,
  ADD COLUMN IF NOT EXISTS assigned_daytime_start_time TIME,
  ADD COLUMN IF NOT EXISTS assigned_daytime_end_time   TIME;

COMMENT ON COLUMN parent_attendance_contacts.service_type IS
  '施設が承認時に割り振ったサービス区分（regular=放デイ / daytime_support=日中一時 / both=両方）。保護者は選ばない';
COMMENT ON COLUMN parent_attendance_contacts.service_start_time IS
  '保護者が希望した利用開始時刻。施設の割り振りは assigned_* を見ること';
COMMENT ON COLUMN parent_attendance_contacts.service_end_time IS
  '保護者が希望した利用終了時刻。施設の割り振りは assigned_* を見ること';
COMMENT ON COLUMN parent_attendance_contacts.assigned_service_start_time IS
  '施設が割り振った放デイの開始時刻';
COMMENT ON COLUMN parent_attendance_contacts.assigned_service_end_time IS
  '施設が割り振った放デイの終了時刻';
COMMENT ON COLUMN parent_attendance_contacts.assigned_daytime_start_time IS
  '施設が割り振った日中一時支援の開始時刻';
COMMENT ON COLUMN parent_attendance_contacts.assigned_daytime_end_time IS
  '施設が割り振った日中一時支援の終了時刻';
