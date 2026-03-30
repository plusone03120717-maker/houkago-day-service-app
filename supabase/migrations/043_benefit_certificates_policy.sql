-- benefit_certificates に staff/admin が全操作できるポリシーを追加
-- RLS は有効化済みだがポリシーが存在せず INSERT/UPDATE/DELETE が拒否されていた

CREATE POLICY "staff_manage_benefit_certificates" ON benefit_certificates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );
