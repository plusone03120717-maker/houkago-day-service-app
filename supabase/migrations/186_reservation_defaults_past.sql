-- 9/1〜昨日の利用予定に残っている、昔の既定値（区分「両方」・お迎え「自宅」）を空にする（2026-11-14 依頼主）。
--
-- 184（お迎え場所）・185（送迎区分）は今日以降だけを空にした。2026-11-14 から予定の値は
-- 「その日に人が決めたこと」として利用スケジュールより強く効くため、過去の日を開くと
-- 既定値が「保護者の利用連絡」として扱われ、カレンダーのまちがった「！」・出席管理と
-- 日々の記録の初期値「両方」・送迎管理の「保護者の指定」の札が出ていた（221件）。
-- 国保連の請求は出席の記録（daily_attendance）だけを読むので、請求には響かない。
-- 保護者の利用連絡を承認した日は残す。9/1 より前の日は依頼主に確かめた範囲の外なので変えない。

UPDATE usage_reservations r
SET transport_type = CASE WHEN r.transport_type = 'both' THEN NULL ELSE r.transport_type END,
    pickup_location_type = CASE
      WHEN r.pickup_location_type = 'home' AND r.pickup_address_id IS NULL THEN NULL
      ELSE r.pickup_location_type
    END
WHERE r.date >= DATE '2026-09-01'
  AND r.date < DATE '2026-11-14'
  AND (r.transport_type = 'both' OR (r.pickup_location_type = 'home' AND r.pickup_address_id IS NULL))
  AND NOT EXISTS (
    SELECT 1
    FROM parent_attendance_contacts c
    WHERE c.child_id = r.child_id
      AND c.date = r.date
      AND c.approval_status = 'approved'
  );
