-- イベントに複数のスタッフを紐付けるジャンクションテーブル
CREATE TABLE IF NOT EXISTS schedule_event_staff (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
  UNIQUE(event_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_staff_event_id
  ON schedule_event_staff(event_id);
