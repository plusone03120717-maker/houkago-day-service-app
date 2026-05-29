-- お送りを複数便に分けられるよう、方向ごとの一意制約を削除
ALTER TABLE transport_schedules
  DROP CONSTRAINT IF EXISTS transport_schedules_unit_date_direction_key;
