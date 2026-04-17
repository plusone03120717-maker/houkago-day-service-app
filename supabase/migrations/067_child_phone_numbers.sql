CREATE TABLE child_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '自宅',
  phone_number TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE child_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_child_phone_numbers" ON child_phone_numbers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'staff'))
  );

CREATE POLICY "parent_read_own_child_phone_numbers" ON child_phone_numbers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM parent_children pc WHERE pc.user_id = auth.uid() AND pc.child_id = child_phone_numbers.child_id)
  );
