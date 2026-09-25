-- 「未来の日が『出席済み』」チェックをオフにしたため、未対応で残っている指摘を閉じる。
-- 前日に翌日分の出席をまとめて付ける運用が定着しており、指摘はすべて正常な記録だった。
-- オフにしたルールの指摘は夜間バッチでは自動解消されないので、ここで一度だけ片付ける。
UPDATE anomaly_findings
SET status = 'dismissed',
    closed_at = NOW(),
    closed_note = 'チェック項目をオフにしたため一括でクローズ（前日に出席を付ける運用）'
WHERE rule = 'future_attended'
  AND status = 'open';
