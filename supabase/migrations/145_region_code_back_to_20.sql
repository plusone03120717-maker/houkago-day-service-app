-- 地域区分「その他」のコードを 20 に戻す。
--
-- 142 で 20 → 23 に変更したが、これは誤り。
-- 前システムが取込に成功したCSVの該当項目が 23 だったことを根拠に
-- 「その他 = 23」と推測して変更したもので、仕様書で裏を取っていなかった。
-- 事業所の運用上の正は 20（その他）。

ALTER TABLE facilities ALTER COLUMN region_code SET DEFAULT '20';
UPDATE facilities SET region_code = '20' WHERE region_code = '23';

COMMENT ON COLUMN facilities.region_code IS
  '地域区分コード（2桁: 01=一級地〜20=その他）';
