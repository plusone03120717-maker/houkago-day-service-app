-- =====================================================
-- 施設カレンダー（行事・休業日管理）
-- =====================================================

CREATE TABLE IF NOT EXISTS facility_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID REFERENCES facilities(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'closed',        -- 休業日（臨時休業・年末年始等）
    'half_day',      -- 短縮営業
    'event',         -- 行事（遠足・運動会等）
    'training',      -- 職員研修日
    'holiday'        -- 祝日（参考表示）
  )),
  title TEXT NOT NULL,
  description TEXT,
  affects_reservation BOOLEAN NOT NULL DEFAULT FALSE, -- TRUEのとき保護者予約を非表示
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_events_date ON facility_events(event_date);
CREATE INDEX IF NOT EXISTS idx_facility_events_facility_id ON facility_events(facility_id);

ALTER TABLE facility_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_facility_events" ON facility_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staff_read_facility_events" ON facility_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE POLICY "parent_read_facility_events" ON facility_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'parent')
  );

CREATE TRIGGER update_facility_events_updated_at
  BEFORE UPDATE ON facility_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
