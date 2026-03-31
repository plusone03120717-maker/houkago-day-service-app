-- 再帰ポリシーを削除
DROP POLICY IF EXISTS "admin_read_all_users" ON users;

-- RLSをバイパスするセキュリティ定義関数で管理者チェック
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 再帰しないポリシー: 自分自身 OR is_admin()
CREATE POLICY "admin_read_all_users" ON users
  FOR SELECT
  USING (auth.uid() = id OR is_admin());
