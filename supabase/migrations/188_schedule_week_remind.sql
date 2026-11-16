-- 週ごとの予定の「確認しました」を、まだ押していない保護者へ LINE で催促する。
--
-- 全員には送らない。利用状況の画面の一覧で、施設が前もってチェックした児童の保護者だけに送る。
-- チェックは週ごとではなく、外すまで残る。
--
--   schedule_remind_targets    催促してよい児童（チェックの状態。外したら行を消す）
--   schedule_week_reminders    催促を送った記録（週×LINE のユーザーに1行）
--
-- 送るのは日曜18時の定期実行（/api/cron/schedule-week-remind）。翌週（月曜から）の分を送る。
-- 同じ週に同じ保護者へ2回送らないよう、送った記録を先に確かめる。
--
-- 書きこむのはサーバーだけ（service role）。ブラウザからは職員が読むことだけを許す。

CREATE TABLE IF NOT EXISTS schedule_remind_targets (
  child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schedule_week_reminders (
  week_start DATE NOT NULL,
  line_user_id TEXT NOT NULL,
  child_ids UUID[] NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_start, line_user_id),
  CONSTRAINT schedule_week_reminders_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

ALTER TABLE schedule_remind_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_week_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_schedule_remind_targets" ON schedule_remind_targets;
CREATE POLICY "staff_read_schedule_remind_targets" ON schedule_remind_targets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));

DROP POLICY IF EXISTS "staff_read_schedule_week_reminders" ON schedule_week_reminders;
CREATE POLICY "staff_read_schedule_week_reminders" ON schedule_week_reminders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','staff')));
