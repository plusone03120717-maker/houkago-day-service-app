-- 施設情報を管理者が更新できるようにする
--
-- facilities には参照（staff_read_facilities）のポリシーしかなく、更新のポリシーが
-- 無かった。RLS が有効なテーブルは、該当するポリシーが無い操作を「0件更新」として
-- 無言で弾く。そのため設定 → 施設・ユニット管理の「国保連請求設定」で保存しても
-- エラーは出ないまま何も保存されていなかった（地域区分・単位数単価も同じ）。
--
-- 事業所番号・地域区分・単位数単価は国保連CSVの必須項目なので、管理者が画面から
-- 変更できるようにする。スタッフは参照のみのまま。

DROP POLICY IF EXISTS "admin_update_facilities" ON facilities;
CREATE POLICY "admin_update_facilities" ON facilities
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
