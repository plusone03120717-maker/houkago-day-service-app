-- parent_children テーブルのRLSポリシー追加
-- 管理者がparent_childrenを挿入・更新できるようにする

CREATE POLICY "admin_manage_parent_children" ON parent_children
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- 保護者が自分のレコードを読めるようにする（既存ポリシーがなければ追加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'parent_children'
    AND policyname = 'parent_read_own'
  ) THEN
    CREATE POLICY "parent_read_own" ON parent_children
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
