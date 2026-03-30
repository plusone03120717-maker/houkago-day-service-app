-- billing_monthly
CREATE POLICY "staff_manage_billing_monthly" ON billing_monthly
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

-- billing_details
CREATE POLICY "staff_manage_billing_details" ON billing_details
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

-- billing_actual_costs
CREATE POLICY "staff_manage_billing_actual_costs" ON billing_actual_costs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

-- billing_invoices
CREATE POLICY "staff_manage_billing_invoices" ON billing_invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "parent_read_own_billing_invoices" ON billing_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = billing_invoices.child_id
        AND pc.user_id = auth.uid()
    )
  );
