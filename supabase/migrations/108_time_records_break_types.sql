-- time_records の type に中抜け（break_start/break_end）を追加
ALTER TABLE time_records DROP CONSTRAINT IF EXISTS time_records_type_check;
ALTER TABLE time_records
  ADD CONSTRAINT time_records_type_check
  CHECK (type IN ('clock_in', 'clock_out', 'break_start', 'break_end'));
