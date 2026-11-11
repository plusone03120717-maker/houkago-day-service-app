-- 181: 残業・有給が「どこから来た申請か」を列で持つ（2026-11-12）
--
-- 承認の履歴（/staff-requests/history）は、LINE から来た申請を
-- note の「LINEアプリから申請」という文字で見分けていた。
-- ところが管理画面で同じ日の残業を保存すると note が上書きされ、
-- 履歴から消えてしまう。見分けを note から切り離す。
--
-- line ＝スタッフが LINE で申請した／null ＝管理者が画面から入れた
-- 管理画面の保存はこの列を送らないので、上書きされても line のまま残る。

ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS source TEXT
  CHECK (source IS NULL OR source = 'line');
ALTER TABLE paid_leave_usages ADD COLUMN IF NOT EXISTS source TEXT
  CHECK (source IS NULL OR source = 'line');

-- いまある LINE の申請に印を写す（印が残っている行だけ）
UPDATE overtime_requests SET source = 'line' WHERE note = 'LINEアプリから申請' AND source IS NULL;
UPDATE paid_leave_usages SET source = 'line' WHERE note = 'LINEアプリから申請' AND source IS NULL;

COMMENT ON COLUMN overtime_requests.source IS 'line＝スタッフが LINE で申請した。null＝管理者が画面から入れた';
COMMENT ON COLUMN paid_leave_usages.source IS 'line＝スタッフが LINE で申請した。null＝管理者が画面から入れた';
