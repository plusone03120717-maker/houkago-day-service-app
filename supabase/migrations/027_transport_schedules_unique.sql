-- 同日・同ユニット・同方向のスケジュール重複を防ぐ制約
ALTER TABLE transport_schedules
  ADD CONSTRAINT transport_schedules_unit_date_direction_key
  UNIQUE (unit_id, date, direction);
