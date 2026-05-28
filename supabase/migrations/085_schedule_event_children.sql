-- 1イベントに複数の子どもを紐付けるジャンクションテーブル
CREATE TABLE IF NOT EXISTS schedule_event_children (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id)        ON DELETE CASCADE,
  UNIQUE(event_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_children_event_id
  ON schedule_event_children(event_id);
