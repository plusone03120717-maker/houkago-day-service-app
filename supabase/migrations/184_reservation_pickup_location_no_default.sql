-- 利用予定（usage_reservations）のお迎え場所の既定値 'home' をやめる（2026-11-14 依頼主）。
--
-- 036 で pickup_location_type を足したとき DEFAULT 'home' を付けたため、
-- 場所を入れずに作った予約（利用スケジュールからまとめて作る・利用状況の画面で足す・
-- 請求の画面で足す）にも、すべて「自宅」が入っていた。
-- 送迎管理は予約の場所を利用スケジュールより優先するので、利用スケジュールで
-- 「学校」にしてある子でも、その日は自宅のお迎えになっていた（今日以降で 248 件・23 人）。
--
-- 予約の場所は「その日だけの指定」（保護者の利用連絡を承認したときに入る）だけに使い、
-- 空なら利用スケジュールに従う。148 の dropoff_location_type と同じ扱いにそろえる。

ALTER TABLE usage_reservations
  ALTER COLUMN pickup_location_type DROP DEFAULT;

COMMENT ON COLUMN usage_reservations.pickup_location_type IS
  'その日の迎えに行く場所の種類（home=住所 / school=学校）。NULL なら利用計画の設定に従う';

-- 今日以降の予約のうち、だれも選んでいない「自宅」（既定値で入ったもの）を空にする。
-- 保護者の利用連絡を承認した日と、登録住所（祖父母宅など）を指定した日は残す。
-- 過去の日は送迎がもう終わっているので変えない。
UPDATE usage_reservations r
SET pickup_location_type = NULL
WHERE r.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND r.pickup_location_type = 'home'
  AND r.pickup_address_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM parent_attendance_contacts c
    WHERE c.child_id = r.child_id
      AND c.date = r.date
      AND c.approval_status = 'approved'
  );
