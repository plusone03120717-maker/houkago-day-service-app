-- billing_details.child_id に ON DELETE CASCADE を追加
ALTER TABLE billing_details
  DROP CONSTRAINT IF EXISTS billing_details_child_id_fkey,
  ADD CONSTRAINT billing_details_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE;

-- messages.child_id に ON DELETE SET NULL を追加（メッセージ自体は残す）
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_child_id_fkey,
  ADD CONSTRAINT messages_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;
