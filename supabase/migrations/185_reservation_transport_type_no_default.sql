-- 利用予定（usage_reservations）の送迎区分の既定値 'both' をやめる（2026-11-14 依頼主）。
--
-- 035 で transport_type を足したとき DEFAULT 'both' を付けたため、区分を入れずに作った予約
-- （利用スケジュールからまとめて作る・利用状況の画面で足す・請求の画面で足す）にも、
-- すべて「行き・帰り両方」が入っていた。送迎管理は予約の区分を利用スケジュールより
-- 優先するので、「送りのみ」「送迎なし」の計画でも、送迎管理ではお迎えの行が出ていた
-- （今日以降で計画と食い違う予約 184 件・16 人）。出席管理は計画を採るので、
-- 2つの画面で送迎区分がずれていた。
--
-- 184（お迎え場所）と同じく、予約の区分は「その日だけの指定」（保護者の利用連絡を
-- 承認したときに入る）だけに使い、空なら利用スケジュールに従う。

ALTER TABLE usage_reservations
  ALTER COLUMN transport_type DROP DEFAULT;

COMMENT ON COLUMN usage_reservations.transport_type IS
  'その日の送迎区分（none / pickup_only / dropoff_only / both）。NULL なら利用計画の設定に従う';

-- 今日以降の予約のうち、だれも選んでいない「両方」（既定値で入ったもの）を空にする。
-- 保護者の利用連絡を承認した日は残す。過去の日は変えない。
UPDATE usage_reservations r
SET transport_type = NULL
WHERE r.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND r.transport_type = 'both'
  AND NOT EXISTS (
    SELECT 1
    FROM parent_attendance_contacts c
    WHERE c.child_id = r.child_id
      AND c.date = r.date
      AND c.approval_status = 'approved'
  );
