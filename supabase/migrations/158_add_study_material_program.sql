-- 日々の記録で「学習教材」を参加チェックできるようにする。
-- 国保連請求の保険外項目「学習教材」とは活動名が同じなので、日々の記録のチェックが自動で同期される。
-- 料金（extra_charge）は未設定のまま登録する。請求書に載せる場合は
-- 設定 → 活動プログラムで料金を入力する。

INSERT INTO activity_programs (facility_id, name, category)
SELECT f.id, '学習教材', '学習'
FROM facilities f
WHERE NOT EXISTS (
  SELECT 1 FROM activity_programs p
  WHERE p.facility_id = f.id AND p.name = '学習教材'
);
