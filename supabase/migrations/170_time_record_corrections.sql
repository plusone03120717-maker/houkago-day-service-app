-- LINEで送られた出勤・退勤時刻による打刻の自動修正の記録
-- 承認なしで time_records を書き換えるため、修正前後の時刻と送られた文面を残す
CREATE TABLE time_record_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  -- 打刻が後で削除されても履歴は残す
  time_record_id UUID REFERENCES time_records(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  target_date DATE NOT NULL,
  -- NULL なら打刻が無かったところへ新しく追加した
  before_recorded_at TIMESTAMPTZ,
  after_recorded_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'line',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE time_record_corrections ENABLE ROW LEVEL SECURITY;

-- 書き込みは LINE webhook（service role）だけが行う
CREATE POLICY "staff_read_time_record_corrections" ON time_record_corrections
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE INDEX time_record_corrections_staff_date ON time_record_corrections (staff_member_id, target_date);
