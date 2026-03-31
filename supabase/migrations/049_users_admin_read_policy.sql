-- 管理者がすべてのユーザーを読めるポリシーを追加
CREATE POLICY "admin_read_all_users" ON users
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
