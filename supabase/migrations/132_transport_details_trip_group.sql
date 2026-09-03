-- 送迎の「便」をまとめる・分解するための識別子。
--
-- 送迎管理では、同じ便（＝同じ車で一緒に回る児童）のドライバー・車種を
-- 1つにまとめて表示・設定する。既定では「区分・送迎時間・送迎場所が同じ」
-- 児童を自動で1便として扱うが、それを崩したい／別の組み合わせにしたい
-- 場合があるため、手動で決めた組み分けをここに記録する。
--
--   NULL       … 自動判定（区分・送迎時間・送迎場所が同じなら同じ便）
--   同じ UUID  … 手動でまとめた便
--   別々の UUID … 手動で分解した（それぞれ単独の便）

ALTER TABLE transport_details
  ADD COLUMN IF NOT EXISTS trip_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_transport_details_trip_group
  ON transport_details (trip_group_id)
  WHERE trip_group_id IS NOT NULL;
