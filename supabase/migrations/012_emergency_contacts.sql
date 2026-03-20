-- =====================================================
-- 緊急連絡先テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                               -- 連絡先氏名
  relationship TEXT NOT NULL,                       -- 続柄（父・母・祖父・祖母など）
  phone_primary TEXT NOT NULL,                      -- 主連絡先電話番号
  phone_secondary TEXT,                             -- 副連絡先電話番号
  is_primary_guardian BOOLEAN NOT NULL DEFAULT FALSE, -- 主保護者か
  can_pickup BOOLEAN NOT NULL DEFAULT FALSE,         -- 送迎可否
  notes TEXT,                                       -- 備考
  sort_order INT NOT NULL DEFAULT 0,                -- 表示順
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_child_id ON emergency_contacts(child_id);

ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_emergency_contacts" ON emergency_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 保護者もアクセス可（自分の子どもの連絡先のみ）
CREATE POLICY "parent_read_own_emergency_contacts" ON emergency_contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = emergency_contacts.child_id
        AND pc.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_emergency_contacts_updated_at
  BEFORE UPDATE ON emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
