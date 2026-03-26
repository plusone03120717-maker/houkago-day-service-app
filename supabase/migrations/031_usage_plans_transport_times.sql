-- usage_plans にお迎え・お送り時間を追加
ALTER TABLE usage_plans
  ADD COLUMN IF NOT EXISTS pickup_time TIME,
  ADD COLUMN IF NOT EXISTS dropoff_time TIME;

-- transport_schedules の既存ユニーク制約を削除（direction単体 → direction+departure_time に変更）
ALTER TABLE transport_schedules
  DROP CONSTRAINT IF EXISTS transport_schedules_unit_date_direction_key;

-- 新しいユニーク制約：同一ユニット・日付・方向・出発時刻の組み合わせで一意
-- NULLS NOT DISTINCT により departure_time が NULL 同士も同一とみなす（時間未設定の便は1つだけ）
ALTER TABLE transport_schedules
  ADD CONSTRAINT transport_schedules_unit_date_direction_time_key
  UNIQUE NULLS NOT DISTINCT (unit_id, date, direction, departure_time);
