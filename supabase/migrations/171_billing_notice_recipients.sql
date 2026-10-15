-- 国保連請求の月初自動化（段階1）で、要確認のお知らせを LINE で受け取る請求担当。
--
-- 毎月1日の朝にアプリが前月分を集計し、直してほしいところをこの担当へ送る。
-- 誰に送るかは「設定 → 国保連請求の月初お知らせ」で選ぶ（LINE 連携済みのスタッフだけ受け取れる）。
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS receives_billing_notice BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN staff_members.receives_billing_notice IS
  '国保連請求の月初お知らせ（前月分の集計結果と要確認）を LINE で受け取るか';
