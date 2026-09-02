-- 送迎明細（transport_details）が持っていた時刻・ドライバー・車種を
-- その日の記録（daily_attendance）に移す。
--
-- 送迎管理・日々の記録・出席カレンダーの3画面が同じ daily_attendance を
-- 編集する構成に変えたため、transport_details 側の同項目は不要になった。
-- 列を落とす前に、まだ daily_attendance が空の項目だけを埋める。
-- （日々の記録で入力済みの値は正なので上書きしない）
--
-- 対応関係:
--   お迎え … pickup_time        → pickup_arrival_time（子どもと合流する時刻）
--            actual_pickup_time → pickup_departure_time（施設を出る時刻）
--   お送り … pickup_time        → dropoff_departure_time（施設を出る時刻）
--            actual_pickup_time → dropoff_departure_time（同上・出発時刻のため）
--   ドライバー・車種は方向ごとの列へ

-- ── お迎え ──────────────────────────────────────────────
UPDATE daily_attendance a
SET
  pickup_arrival_time = COALESCE(a.pickup_arrival_time, d.pickup_time),
  pickup_departure_time = COALESCE(
    a.pickup_departure_time,
    d.actual_pickup_time,
    -- 到着しか分からない場合は施設出発を10分前とみなす（画面と同じ既定）
    d.pickup_time - INTERVAL '10 minutes'
  ),
  pickup_driver_member_id = COALESCE(a.pickup_driver_member_id, d.driver_member_id),
  pickup_vehicle_id = COALESCE(a.pickup_vehicle_id, d.vehicle_id)
FROM transport_details d
JOIN transport_schedules s ON s.id = d.schedule_id
WHERE d.child_id = a.child_id
  AND s.unit_id = a.unit_id
  AND s.date = a.date
  AND s.direction = 'pickup'
  AND a.status <> 'absent'
  AND (
    d.pickup_time IS NOT NULL
    OR d.actual_pickup_time IS NOT NULL
    OR d.driver_member_id IS NOT NULL
    OR d.vehicle_id IS NOT NULL
  );

-- ── お送り ──────────────────────────────────────────────
UPDATE daily_attendance a
SET
  dropoff_departure_time = COALESCE(a.dropoff_departure_time, d.pickup_time, d.actual_pickup_time),
  dropoff_arrival_time = COALESCE(
    a.dropoff_arrival_time,
    -- 出発しか分からない場合は到着を10分後とみなす（画面と同じ既定）
    COALESCE(d.pickup_time, d.actual_pickup_time) + INTERVAL '10 minutes'
  ),
  dropoff_driver_member_id = COALESCE(a.dropoff_driver_member_id, d.driver_member_id),
  dropoff_vehicle_id = COALESCE(a.dropoff_vehicle_id, d.vehicle_id)
FROM transport_details d
JOIN transport_schedules s ON s.id = d.schedule_id
WHERE d.child_id = a.child_id
  AND s.unit_id = a.unit_id
  AND s.date = a.date
  AND s.direction = 'dropoff'
  AND a.status <> 'absent'
  AND (
    d.pickup_time IS NOT NULL
    OR d.actual_pickup_time IS NOT NULL
    OR d.driver_member_id IS NOT NULL
    OR d.vehicle_id IS NOT NULL
  );
