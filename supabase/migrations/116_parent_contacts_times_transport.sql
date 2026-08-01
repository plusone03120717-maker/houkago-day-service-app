-- 保護者の利用連絡に「利用時間」「送迎区分（送り/迎えの区別）」「送迎時間」を追加
ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS service_start_time time,
  ADD COLUMN IF NOT EXISTS service_end_time time,
  ADD COLUMN IF NOT EXISTS transport_type text NOT NULL DEFAULT 'none'
    CHECK (transport_type IN ('none', 'pickup_only', 'dropoff_only', 'both')),
  ADD COLUMN IF NOT EXISTS pickup_time time,
  ADD COLUMN IF NOT EXISTS dropoff_time time;

-- 既存の pickup_required（真偽値）を transport_type に移行する。
-- 送り/迎えの区別が無かったデータは「送り迎え両方」とみなす。
UPDATE parent_attendance_contacts
  SET transport_type = 'both'
  WHERE pickup_required = true AND status = 'attending' AND transport_type = 'none';

-- pickup_required は transport_type に置き換わったため、
-- 旧コードが動作中でもINSERTが失敗しないようデフォルトを明示しておく。
-- （実際の列削除はデプロイ完了後の migration 117 で行う）
ALTER TABLE parent_attendance_contacts
  ALTER COLUMN pickup_required SET DEFAULT false;

COMMENT ON COLUMN parent_attendance_contacts.transport_type IS
  'none=送迎なし / pickup_only=迎えのみ / dropoff_only=送りのみ / both=送り迎え';
COMMENT ON COLUMN parent_attendance_contacts.pickup_time IS 'お迎え希望時刻（施設→児童）';
COMMENT ON COLUMN parent_attendance_contacts.dropoff_time IS 'お送り希望時刻（施設→自宅）';
