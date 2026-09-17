-- 保護者が「施設で決まっている自分の子の利用予定」を読めるようにする。
--
-- 保護者ポータルのカレンダーには、保護者自身が送った利用連絡しか出ていなかった。
-- 毎週の利用スケジュールが登録されている児童でもカレンダーが真っ白に見えるため、
-- すでに予定がある日に重ねて連絡が来たり、逆に必要な連絡が来なかったりしていた。
--
-- migration 115 で保護者の読み書きポリシーを落としているが、あれは保護者が
-- 予約を「作る」機能を廃止したため。ここで戻すのは**読み取りだけ**で、
-- 保護者が予定を書き換えられるようにはしない。
CREATE POLICY "parent_read_own_reservations" ON usage_reservations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.user_id = auth.uid()
        AND pc.child_id = usage_reservations.child_id
    )
  );

CREATE POLICY "parent_read_own_usage_plans" ON usage_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.user_id = auth.uid()
        AND pc.child_id = usage_plans.child_id
    )
  );

-- 特定日のキャンセルを読めないと、取り消された日まで予定として見えてしまう。
-- このテーブルには authenticated 全体に FOR ALL のポリシーが既にあるため実質は重複だが、
-- あちらを絞り込んだときに保護者側が壊れないよう、必要な読み取りを明示しておく
CREATE POLICY "parent_read_own_plan_overrides" ON usage_plan_date_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM usage_plans p
      JOIN parent_children pc ON pc.child_id = p.child_id
      WHERE p.id = usage_plan_date_overrides.plan_id
        AND pc.user_id = auth.uid()
    )
  );
