-- 学習教材の追加料金を 200円 に設定する（日々の記録の参加チェックから請求書に自動で載る）。
-- すでに料金を入力済みの施設は上書きしない。

UPDATE activity_programs
SET extra_charge = 200
WHERE name = '学習教材'
  AND extra_charge IS NULL;
