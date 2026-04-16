-- スタッフがユニット一覧を参照できるポリシーを修正
-- 旧: staff_profiles に登録済み かつ そのユニットに割り当てられている場合のみ読める
-- 新: role が admin または staff のユーザーはすべてのユニットを読める

DROP POLICY IF EXISTS "staff_read_units" ON units;

CREATE POLICY "staff_read_units" ON units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'staff')
    )
  );
