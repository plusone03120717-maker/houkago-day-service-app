-- children_units RLS ポリシー追加
CREATE POLICY "staff_manage_children_units" ON children_units
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));
