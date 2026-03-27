-- 保護者ユーザーがユニット一覧を参照できるポリシーを追加
CREATE POLICY "parent_read_units" ON units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'parent'
    )
  );
