-- 日々の記録で出席した子は「おやつ」「学習教材」を既定でチェックする。
-- 既定チェックの対象になる活動プログラム「おやつ」が未登録の施設には、100円の追加料金つきで登録する。
-- すでに登録済みの施設の料金は上書きしない（未入力の場合のみ100円を設定）。

INSERT INTO activity_programs (facility_id, name, category, extra_charge)
SELECT f.id, 'おやつ', '食事', 100
FROM facilities f
WHERE NOT EXISTS (
  SELECT 1 FROM activity_programs p
  WHERE p.facility_id = f.id AND p.name = 'おやつ'
);

UPDATE activity_programs
SET extra_charge = 100
WHERE name = 'おやつ'
  AND extra_charge IS NULL;
