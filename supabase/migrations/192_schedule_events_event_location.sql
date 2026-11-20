-- 全体スケジュールの予定（schedule_events）に「行事・イベント」の種類と「場所」の欄を足す（2026-11-20 依頼主）。
-- 足すだけで、今ある予定の行は書き換えない。何度流しても同じになる書き方にしている。
-- 種類：会議 meeting・モニタリング monitoring・行事 event・外部 external・その他 other
-- （研修は行っていないので足さない。「その他」は中身をタイトルに自由に書く）
-- 1つの ALTER TABLE にまとめ、決まりを外したまま途中で止まることがないようにしている。
-- 月のカレンダーで日付の範囲を読むための索引は 084 の schedule_events_date_idx がある。

ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS location TEXT,
  DROP CONSTRAINT IF EXISTS schedule_events_event_type_check,
  ADD CONSTRAINT schedule_events_event_type_check
    CHECK (event_type IN ('meeting', 'monitoring', 'event', 'external', 'other'));
