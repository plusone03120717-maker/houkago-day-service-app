-- daily_records / daily_activities / contact_notes のRLSポリシー追加
-- RLSは有効だがポリシーが未定義のため全操作がブロックされていた

CREATE POLICY "staff_manage_daily_records" ON daily_records
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

CREATE POLICY "staff_manage_daily_activities" ON daily_activities
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

CREATE POLICY "staff_manage_contact_notes" ON contact_notes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

CREATE POLICY "parent_read_contact_notes" ON contact_notes
  FOR SELECT
  USING (
    published_at IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.user_id = auth.uid()
      AND pc.child_id = contact_notes.child_id
    )
  );
