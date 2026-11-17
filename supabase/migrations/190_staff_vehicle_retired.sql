-- 辞めたスタッフ・使わなくなった車を「消さずに外す」ための列（2026-11-17 依頼主「作って」）。
-- 削除すると、スタッフはタイムカード・有給・残業の記録まで一緒に消え（ON DELETE CASCADE）、
-- 過去の送迎のドライバー・車種も空になる（SET NULL）。そこで、ふだんは削除せず日付を入れて外す。
--   retired_at が入っている人・車は、その日の翌日から選ぶ欄・送迎のボタン・打刻の知らせから外れる。
--   過去の記録はそのまま残り、記録に入っている日の画面では名前も出る。
-- 列を足すだけなので、今のデータは変わらない。
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS retired_at DATE;
ALTER TABLE transport_vehicles ADD COLUMN IF NOT EXISTS retired_at DATE;

COMMENT ON COLUMN staff_members.retired_at IS '退職日（最後に働いた日）。翌日から選ぶ欄・打刻の知らせから外す。NULL は在籍中';
COMMENT ON COLUMN transport_vehicles.retired_at IS '使わなくなった日。翌日から選ぶ欄から外す。NULL は使用中';
