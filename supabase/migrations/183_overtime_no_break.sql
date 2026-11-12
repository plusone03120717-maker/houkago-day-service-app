-- 183: 「休憩なし」の申請を残業申請の表に入れられるようにする（2026-11-12）
--
-- 昼休憩をとれなかった日に、スタッフが LINE から「休憩なし」を申請する。
-- request_type = 'no_break' の行は、その日の昼休憩（5時間以上で自動で引く60分）を
-- 勤務時間から引かない印になる。overtime_minutes には引かなかった60分を入れ、残業として数える。
-- 労働基準法34条で休憩は本来とらせるもの。昼にとれない日はほかの時間にずらしてとってもらい、
-- それでもとれなかった日を記録するための申請（管理画面では「休憩なし」と目立たせる）。

ALTER TABLE overtime_requests DROP CONSTRAINT IF EXISTS overtime_requests_request_type_check;
ALTER TABLE overtime_requests
  ADD CONSTRAINT overtime_requests_request_type_check
  CHECK (request_type IN ('pre', 'auto', 'no_break'));

COMMENT ON COLUMN overtime_requests.request_type IS
  'pre＝残業申請（終了時刻あり）／auto＝自動検知／no_break＝休憩なし（その日の昼休憩60分を勤務時間から引かない）';
