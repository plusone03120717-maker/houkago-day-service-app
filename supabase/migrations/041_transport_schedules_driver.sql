-- 送迎スケジュールにドライバー（staff_members）を紐付けるカラムを追加
-- staff_members テーブルはメールアドレス不要のドライバー専用テーブル
ALTER TABLE transport_schedules
  ADD COLUMN IF NOT EXISTS driver_member_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;
