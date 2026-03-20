-- daily_attendance RLSポリシー追加
-- RLSは有効だがポリシーが未定義のため全操作がブロックされていた

CREATE POLICY "staff_manage_daily_attendance" ON daily_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "parent_read_own_attendance" ON daily_attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.user_id = auth.uid()
      AND pc.child_id = daily_attendance.child_id
    )
  );
