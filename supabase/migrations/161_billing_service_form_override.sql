-- 請求の日別表で、その日の提供形態（平日／休日）を手動で切り替えられるようにする。
-- NULL は自動判定（土日祝・学校休日・施設カレンダーの休日なら休日）。
-- 基本報酬の行（billing_start_time などの時刻上書きと同じ行）に保存する。
-- 1 = 平日（授業終了後） / 2 = 休日（学校休業日・土日祝）

ALTER TABLE billing_daily_records
  ADD COLUMN IF NOT EXISTS service_form_override SMALLINT
  CHECK (service_form_override IN (1, 2));
