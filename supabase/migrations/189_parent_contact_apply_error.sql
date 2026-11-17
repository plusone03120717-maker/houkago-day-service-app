-- 保護者の利用連絡を承認したのに、予定（出欠記録・送迎）へ反映できなかったことを残す。
--
-- これまでは失敗の理由が承認画面を開いている間だけ出て、閉じると消えていた。
-- 承認したのに子が出席管理に出ない・送迎が違う、という食い違いに後から気づけるよう、
-- 理由と時刻を連絡に残す。反映できたら NULL に戻す（@/app/api/parent-contacts/approval）。
-- 列を足すだけ。既存の行は NULL（＝問題なし）のまま。
alter table public.parent_attendance_contacts
  add column if not exists apply_error text,
  add column if not exists apply_error_at timestamptz;

comment on column public.parent_attendance_contacts.apply_error is
  '承認したのに予定へ反映できなかった理由。反映できたら NULL';
comment on column public.parent_attendance_contacts.apply_error_at is
  'apply_error を記録した時刻';
