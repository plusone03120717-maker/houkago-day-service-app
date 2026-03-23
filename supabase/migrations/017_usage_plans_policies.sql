-- usage_plans と usage_reservations の RLS ポリシー

-- usage_plans: スタッフ・管理者が全操作可能
CREATE POLICY "staff_manage_usage_plans" ON usage_plans
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

-- usage_reservations: スタッフ・管理者が全操作可能
CREATE POLICY "staff_manage_usage_reservations" ON usage_reservations
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));
