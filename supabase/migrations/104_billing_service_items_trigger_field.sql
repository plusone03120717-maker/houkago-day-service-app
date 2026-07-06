-- trigger_field の CHECK 制約を拡張（daytime_pickup / daytime_dropoff / absent を追加）
ALTER TABLE billing_service_items
  DROP CONSTRAINT IF EXISTS billing_service_items_trigger_field_check;

ALTER TABLE billing_service_items
  ADD CONSTRAINT billing_service_items_trigger_field_check
  CHECK (trigger_field IN (
    'basic',
    'transport_pickup',
    'transport_dropoff',
    'daytime_support',
    'daytime_pickup',
    'daytime_dropoff',
    'absent',
    'manual'
  ));
