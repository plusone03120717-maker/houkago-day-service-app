-- 週ごとの予定のお知らせと、保護者の「確認しました」。
--
-- 施設が一括で入れた利用スケジュールは、保護者が見たかどうかが施設から分からなかった
-- （変更がない保護者は何も連絡してこないため）。そこで次の2つを記録する。
--
--   schedule_week_notices        スタッフが「この週の予定を保護者に知らせる」を押した記録（週に1行）
--   schedule_week_confirmations  保護者が「確認しました」を押した記録（児童×週に1行）
--
-- どちらも、押した時点の予定の中身（日ごとの要約）を snapshot に残す。
-- 今の予定と比べて、確認のあとで施設が予定を変えた日（「変更後まだ」）を見つけるため。
-- 保護者が自分で利用連絡を送って変えた日は、承認したときにその日の snapshot を
-- 追いつかせるので「変更後まだ」にならない（src/lib/schedule-week-confirm-db.ts）。
--
-- 書きこむのはサーバーだけ（service role）。保護者の API は「自分の子か」を確かめてから書く。
-- ブラウザから直接は、職員が読むことだけを許す（閲覧のみの施設長・スタッフが
-- 確認の記録を書きかえたり消したりできないように）。

CREATE TABLE IF NOT EXISTS schedule_week_notices (
  week_start DATE PRIMARY KEY,                -- その週の月曜日
  first_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notify_count INTEGER NOT NULL DEFAULT 1,
  -- { "<child_id>": { "<YYYY-MM-DD>": "<その日の予定の要約>" } }
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT schedule_week_notices_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

CREATE TABLE IF NOT EXISTS schedule_week_confirmations (
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- { "<YYYY-MM-DD>": "<その日の予定の要約>" }
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (child_id, week_start),
  CONSTRAINT schedule_week_confirmations_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

CREATE INDEX IF NOT EXISTS schedule_week_confirmations_week_idx
  ON schedule_week_confirmations (week_start);

ALTER TABLE schedule_week_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_week_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_schedule_week_notices" ON schedule_week_notices;
CREATE POLICY "staff_read_schedule_week_notices" ON schedule_week_notices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

DROP POLICY IF EXISTS "staff_read_schedule_week_confirmations" ON schedule_week_confirmations;
CREATE POLICY "staff_read_schedule_week_confirmations" ON schedule_week_confirmations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));
