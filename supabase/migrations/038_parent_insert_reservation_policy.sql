-- 保護者が自分の子供の予約をINSERTできるポリシーを追加
CREATE POLICY "parent_insert_own_reservations" ON usage_reservations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parent_children
      WHERE parent_children.child_id = usage_reservations.child_id
      AND parent_children.user_id = auth.uid()
    )
  );

-- 保護者が自分の子供の予約をキャンセル（UPDATE status）できるポリシーを追加
CREATE POLICY "parent_update_own_reservations" ON usage_reservations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM parent_children
      WHERE parent_children.child_id = usage_reservations.child_id
      AND parent_children.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parent_children
      WHERE parent_children.child_id = usage_reservations.child_id
      AND parent_children.user_id = auth.uid()
    )
  );
