-- 送迎明細から、その日の記録（daily_attendance）へ移した列を落とす。
--
-- 130 で値は daily_attendance に退避済み。ここから先、
-- transport_details が持つのは「誰を・どこで・どの順に」だけになる。
--
-- ※ この操作は元に戻せない。130 を適用したうえで、新しい送迎管理画面が
--    問題なく動いていることを確認してから流すこと。
--    先送りしたい場合はこのファイルを migrations から外しておけばよい。

ALTER TABLE transport_details
  DROP COLUMN IF EXISTS pickup_time,
  DROP COLUMN IF EXISTS actual_pickup_time,
  DROP COLUMN IF EXISTS driver_member_id,
  DROP COLUMN IF EXISTS vehicle_id;
