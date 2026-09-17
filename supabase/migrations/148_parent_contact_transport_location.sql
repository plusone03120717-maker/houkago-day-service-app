-- 保護者は送迎の「時刻」ではなく「場所」を指定する。
--
-- 送迎の時刻は、承認したサービス区分の利用時間から施設側で自動的に決まるため、
-- 保護者に入力させる意味がなかった（入れてもらっても施設が引き直していた）。
-- 代わりに、これまで聞けていなかった「どこへ迎えに行くか・どこへ送るか」を
-- 保護者が選べるようにする。学校・自宅のほか、祖父母宅などの
-- 登録済みの住所（child_addresses）も選べる。
--
-- 場所の持ち方は既存の送迎設定（child_transport_settings / usage_plans）に合わせ、
-- location_type（home / school）＋ どの登録住所か（address_id）で表す。
-- address_id が NULL の home は児童の基本住所（children.address）を指す。

ALTER TABLE parent_attendance_contacts
  ADD COLUMN IF NOT EXISTS pickup_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (pickup_location_type IN ('home', 'school')),
  ADD COLUMN IF NOT EXISTS dropoff_location_type TEXT NOT NULL DEFAULT 'home'
    CHECK (dropoff_location_type IN ('home', 'school')),
  ADD COLUMN IF NOT EXISTS pickup_address_id UUID REFERENCES child_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_address_id UUID REFERENCES child_addresses(id) ON DELETE SET NULL;

COMMENT ON COLUMN parent_attendance_contacts.pickup_location_type IS
  '保護者が指定した迎えに行く場所の種類（home=住所 / school=学校）';
COMMENT ON COLUMN parent_attendance_contacts.pickup_address_id IS
  '迎えに行く登録住所（child_addresses）。NULL なら児童の基本住所';
COMMENT ON COLUMN parent_attendance_contacts.dropoff_location_type IS
  '保護者が指定した送り届ける場所の種類（home=住所 / school=学校）';
COMMENT ON COLUMN parent_attendance_contacts.dropoff_address_id IS
  '送り届ける登録住所（child_addresses）。NULL なら児童の基本住所';

-- 承認した連絡の場所を、その日の利用予定にも持たせる。
-- pickup_location_type は 036 で追加済み。送り先と登録住所は未対応だった。
ALTER TABLE usage_reservations
  ADD COLUMN IF NOT EXISTS dropoff_location_type TEXT
    CHECK (dropoff_location_type IN ('home', 'school')),
  ADD COLUMN IF NOT EXISTS pickup_address_id UUID REFERENCES child_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_address_id UUID REFERENCES child_addresses(id) ON DELETE SET NULL;

COMMENT ON COLUMN usage_reservations.dropoff_location_type IS
  'その日の送り届ける場所の種類（home=住所 / school=学校）。NULL なら利用計画の設定に従う';
COMMENT ON COLUMN usage_reservations.pickup_address_id IS
  'その日の迎えに行く登録住所（child_addresses）。NULL なら児童の基本住所';
COMMENT ON COLUMN usage_reservations.dropoff_address_id IS
  'その日の送り届ける登録住所（child_addresses）。NULL なら児童の基本住所';

-- 保護者ポータルが自分の子の登録住所を読めるようにする（選択肢の表示に必要）。
-- 書き込みは従来どおりスタッフのみ。
DROP POLICY IF EXISTS "parents can read own child addresses" ON child_addresses;
CREATE POLICY "parents can read own child addresses"
  ON child_addresses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = child_addresses.child_id
        AND pc.user_id = auth.uid()
    )
  );
