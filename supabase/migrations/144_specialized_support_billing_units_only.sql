-- 142 で専門的支援実施加算を全ユニットに登録したが、プログラミング・英会話のような
-- 国保連請求の対象外ユニット（units.is_billing_target = false）には不要。
-- 再集計でこれらのユニットの単位数に加算が乗らないよう削除する。

DELETE FROM billing_service_items i
USING units u
WHERE i.unit_id = u.id
  AND i.trigger_field = 'specialized_support'
  AND u.is_billing_target = false;
