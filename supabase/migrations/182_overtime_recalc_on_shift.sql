-- 182: シフトがあとから入ったら、LINE の残業申請の分数を計算し直す（2026-11-12）
--
-- LINE の残業申請（/api/liff/staff/overtime）は、申請したときにその日の
-- シフトの終了時刻との差で残業の分数を出す。シフトがまだ無い日に申請すると
-- scheduled_end_time が空・overtime_minutes が 0 のまま残り、あとでシフトを
-- 入れても計算し直されなかった（承認ずみでも勤務時間集計・タイムカードに出ない）。
--
-- staff_shifts に終了時刻が入ったとき（登録・変更）、同じ職員・同じ日の
-- 「まだ計算できていない」LINE の残業申請だけを計算し直す。
-- scheduled_end_time が入っている行（計算ずみ・管理画面で直した行）には触れない。

CREATE OR REPLACE FUNCTION recalc_line_overtime_from_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE overtime_requests o
  SET scheduled_end_time = NEW.end_time,
      -- 30分単位に切り捨て（LINE の申請の計算と同じ）
      overtime_minutes = GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (o.actual_end_time - NEW.end_time)) / 60 / 30)::int * 30
      )
  FROM staff_members sm
  WHERE sm.user_id = NEW.staff_id
    AND o.staff_id = sm.id
    AND o.date = NEW.date
    AND o.source = 'line'
    AND o.request_type = 'pre'
    AND o.actual_end_time IS NOT NULL
    AND o.scheduled_end_time IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION recalc_line_overtime_from_shift() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recalc_line_overtime_on_shift ON staff_shifts;
CREATE TRIGGER recalc_line_overtime_on_shift
  AFTER INSERT OR UPDATE OF end_time ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION recalc_line_overtime_from_shift();

-- いまある分：申請のあとでシフトが入った日を計算し直す
UPDATE overtime_requests o
SET scheduled_end_time = s.end_time,
    overtime_minutes = GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (o.actual_end_time - s.end_time)) / 60 / 30)::int * 30
    )
FROM staff_members sm
JOIN staff_shifts s ON s.staff_id = sm.user_id
WHERE o.staff_id = sm.id
  AND s.date = o.date
  AND s.end_time IS NOT NULL
  AND o.source = 'line'
  AND o.request_type = 'pre'
  AND o.actual_end_time IS NOT NULL
  AND o.scheduled_end_time IS NULL;
