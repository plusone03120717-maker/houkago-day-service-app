-- 保護者ポータルからのキャンセル連絡を、施設がどう処理したかを控える。
--
-- 保護者は前日までなら利用予定をキャンセルできる（当日のお休みは従来どおり電話）。
-- キャンセルの連絡を受けた施設は、その日を
--   absent … 欠席として記録する（予定は残る。欠席時対応加算の対象になり得る）
--   delete … 予定から削除する（なかったことにする。加算の対象外）
-- のどちらで処理するかを利用連絡ページで選ぶ。
--
-- どちらで処理したかは画面表示（「欠席として反映済み」「予定から削除済み」）と、
-- 同じ連絡を二重に処理しないための判定に使う。未処理のキャンセルは NULL。
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS absent_handling TEXT
    CHECK (absent_handling IN ('absent', 'delete'));

COMMENT ON COLUMN parent_attendance_contacts.absent_handling IS
  'キャンセル連絡の処理方法（absent=欠席として記録 / delete=予定から削除）。NULL は未処理';
