-- 残業申請に未読フラグを追加（自動承認後の確認管理用）
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;
