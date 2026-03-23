-- 保護者が自分の子供の予約・ユニット情報を読み取れるようにする

CREATE POLICY "parent_read_own_reservations" ON usage_reservations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_children
      WHERE parent_children.child_id = usage_reservations.child_id
      AND parent_children.user_id = auth.uid()
    )
  );

CREATE POLICY "parent_read_own_children_units" ON children_units
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_children
      WHERE parent_children.child_id = children_units.child_id
      AND parent_children.user_id = auth.uid()
    )
  );
