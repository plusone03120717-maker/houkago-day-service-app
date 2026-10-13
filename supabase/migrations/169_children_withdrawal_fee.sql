-- 保護者請求書に口座引き落とし手数料（110円）を載せるかどうか。
-- 既定は全員かける。かけない児童だけ児童の編集画面で外す。
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS withdrawal_fee_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN children.withdrawal_fee_enabled IS
  '保護者請求書に口座引き落とし手数料を加えるか（既定 true）';
