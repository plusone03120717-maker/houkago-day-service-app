-- 時給（staff_hourly_rates）と打刻（time_records）を、システム管理者だけに絞る。
--
-- 078 のポリシーは role IN ('admin','staff') だったため、ログインしたスタッフや施設長
-- （users.role = 'admin' ＋ job_titles に facility_manager）が、ブラウザから直接
-- 全員の時給・打刻を読めた。読むだけでなく、書き換え・追加・削除もできた
-- （自分の時給を上げる・打刻を直すなど）。2026-11-02 に本番も 078 のままだと確かめた。
--
-- 画面でこの2表をログイン中の人として触るのは、タイムカード・勤務時間集計・スタッフ申請と
-- 中抜けの確認（/api/staff-requests/break-reviewed）だけで、どれも requireMoneyAccess /
-- hasMoneyAccess（＝システム管理者だけ）の下にある。ここでは src/lib/roles.ts の
-- canManageMoney と同じ条件（role が admin で、施設長ではない）を DB にも持たせる。
-- スタッフ LINE（打刻・中抜け・打刻の訂正・予定）と打刻忘れの Cron は service role なので影響しない。

-- time_records
DROP POLICY IF EXISTS "staff_manage_time_records" ON time_records;
DROP POLICY IF EXISTS "money_admin_manage_time_records" ON time_records;
CREATE POLICY "money_admin_manage_time_records" ON time_records
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
      AND NOT ('facility_manager' = ANY (coalesce(users.job_titles, '{}')))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
      AND NOT ('facility_manager' = ANY (coalesce(users.job_titles, '{}')))
  ));

-- staff_hourly_rates
DROP POLICY IF EXISTS "staff_manage_hourly_rates" ON staff_hourly_rates;
DROP POLICY IF EXISTS "money_admin_manage_hourly_rates" ON staff_hourly_rates;
CREATE POLICY "money_admin_manage_hourly_rates" ON staff_hourly_rates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
      AND NOT ('facility_manager' = ANY (coalesce(users.job_titles, '{}')))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
      AND NOT ('facility_manager' = ANY (coalesce(users.job_titles, '{}')))
  ));
