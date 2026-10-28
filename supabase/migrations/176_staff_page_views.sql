-- スタッフ LINE の画面（マイスケジュールなど）を、誰がいつ開いたかの記録。
--
-- 「送迎担当を LINE で見ている人がいるか」を数字で答えるための記録で、
-- 画面の中身（児童名・送迎の内容）は残さない。残すのは職員・画面・日時だけ。
-- 書き込みも読み取りもサーバー（service role）だけ。ポリシーは作らないので、
-- ブラウザから直接さわれない。

CREATE TABLE IF NOT EXISTS staff_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  -- staff-schedule = マイスケジュール（日表示）／staff-schedule-month = 月表示
  page TEXT NOT NULL,
  -- 日表示のときに見ていた日付（YYYY-MM-DD）。月表示は NULL
  target_date DATE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_page_views_viewed_at ON staff_page_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_page_views_staff ON staff_page_views (staff_member_id, viewed_at DESC);

ALTER TABLE staff_page_views ENABLE ROW LEVEL SECURITY;
