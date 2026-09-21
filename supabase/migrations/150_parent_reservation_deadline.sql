-- 保護者ポータルの利用連絡に「申込締切」を設ける。
--
-- これまでは当日以降ならいつでも新しい日を連絡できたため、月の予定が固まった後に
-- 追加が入り、人員配置や送迎便を組み直すことになっていた。
-- 「翌月分は前月◯日まで」という締切を設定できるようにする。
--
-- 締め切るのは「新しい日を増やすこと」だけ。すでに予定が入っている日の
-- 利用時間・送迎の変更はいつでも送れる（時間の前後は当日の運用で吸収できるため）。
-- 締切後にどうしても追加したい場合は、これまでどおり施設が電話で受けて
-- スタッフが利用状況ページから入れる。

CREATE TABLE IF NOT EXISTS parent_portal_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL UNIQUE REFERENCES facilities(id) ON DELETE CASCADE,
  -- 締切を使うかどうか。OFF なら従来どおり当日以降いつでも連絡できる
  reservation_deadline_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- 前月の何日までに出してもらうか。月末が短い月でもズレないよう 28 日までにする
  reservation_deadline_day SMALLINT NOT NULL DEFAULT 15
    CHECK (reservation_deadline_day BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE parent_portal_settings IS
  '保護者ポータルの運用設定（施設ごと）';
COMMENT ON COLUMN parent_portal_settings.reservation_deadline_enabled IS
  '利用連絡の申込締切を使うか。FALSE なら当日以降いつでも新しい日を連絡できる';
COMMENT ON COLUMN parent_portal_settings.reservation_deadline_day IS
  '翌月分の申込締切日（前月の何日まで）。例: 15 なら 10月分は 9月15日まで';

ALTER TABLE parent_portal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_parent_portal_settings" ON parent_portal_settings;
CREATE POLICY "admin_manage_parent_portal_settings" ON parent_portal_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "staff_read_parent_portal_settings" ON parent_portal_settings;
CREATE POLICY "staff_read_parent_portal_settings" ON parent_portal_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

DROP TRIGGER IF EXISTS update_parent_portal_settings_updated_at ON parent_portal_settings;
CREATE TRIGGER update_parent_portal_settings_updated_at
  BEFORE UPDATE ON parent_portal_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 既存の施設に初期値（前月15日締切・有効）を入れる。
-- 締切日を変えたい場合・締切をやめたい場合は
-- 「設定 → 保護者ポータル設定」から変更する。
INSERT INTO parent_portal_settings (facility_id, reservation_deadline_enabled, reservation_deadline_day)
SELECT id, TRUE, 15 FROM facilities
ON CONFLICT (facility_id) DO NOTHING;
