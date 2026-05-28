-- 全体スケジュール用カスタムイベントテーブル
CREATE TABLE IF NOT EXISTS schedule_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  UUID REFERENCES facilities(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  event_type   TEXT NOT NULL DEFAULT 'other'
               CHECK (event_type IN ('meeting', 'monitoring', 'external', 'other')),
  event_date   DATE NOT NULL,
  start_time   TIME,
  end_time     TIME,
  all_day      BOOLEAN NOT NULL DEFAULT false,
  note         TEXT,
  child_id     UUID REFERENCES children(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_events_date_idx ON schedule_events (event_date);

-- RLS
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_events_select" ON schedule_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "schedule_events_insert" ON schedule_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "schedule_events_update" ON schedule_events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "schedule_events_delete" ON schedule_events
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );
