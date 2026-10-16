# 上限管理の FAX チェック（Claude Code のルーティンの手順）

毎月1〜10日の朝、前月分の上限管理の FAX が他事業所から届いたかを確かめる。
読み取った結果をアプリに記録し、そろった日・未着が残る8日以降・気になる点があるときに、
請求担当（設定 → 国保連請求の月初お知らせ）へ LINE で知らせる。LINE を送るのは `scripts/fax-check.ts`。

## 守ること

- **読むだけ**。Gmail でメールを送らない・返信しない・ラベルを付けない・アーカイブしない・削除しない。FAX も送らない。
- 読み取った金額は下書き。上限管理の画面（upper_limit_managements）には書き込まない。
- 数字に自信がないとき・読めないページがあるときは、推測で埋めずに `concerns` に書く（それが「違和感」として LINE で届く）。
- ダウンロードした PDF と JSON は、最後に必ず削除する（児童の個人情報のため）。

## 手順

作業フォルダは `F:\放課後デイサービス管理アプリ`。対象月 `YYYYMM` は**前月**（10月の朝なら 9月分＝`202609`）。

1. **アカウントの確認**：Claude in Chrome で `https://mail.google.com/mail/u/1/` を開き、タイトルが `you.first.2022.0111@gmail.com` であることを確かめる。
   違えば `u/0`・`u/2` も見て、you.first のものを使う。見つからなければ作業を止め、下の「止まったとき」の手順で知らせる。
2. **読んだ FAX の一覧**：`npx tsx scripts/fax-check.ts processed YYYYMM` を実行する（1行に1ファイル名）。
3. **新しい FAX を探す**：Gmail で `from:message@inbound.jfax.com after:今月1日（YYYY/MM/01）` を検索する。
   件名は「"番号" からの jFax 受信 メッセージ- N 枚」、添付は `FAX_日付_….pdf`。手順2の一覧にあるファイル名は飛ばす。
   新しいものがなければ、手順6を `faxes: []` で実行する（未着の知らせを8日以降に出すため）。
4. **ダウンロード**：メールを開き、添付の「ダウンロード」ボタン（`添付ファイル FAX_….pdf をダウンロード`）を押す。
   Chrome の保存先は `F:\Google ダウンロード`。保存されたら、このセッションの作業用フォルダ（scratchpad）の `fax\` に移す。
5. **読む**：PDF を Read で開き、ページごとに見る。1通に複数の事業所分が入っていることがある（例：ココロン富士吉田＋ココロン松山）。送付状だけのページもある。
   - 「利用者負担額一覧表」→ `copay_list`。提供事業所の番号・名称と、児童ごとの**受給者証番号（10桁）**・総費用額・利用者負担額。
   - 「利用者負担上限額管理結果票」→ `result`。管理事業所の番号・名称、受給者証番号、管理結果（1〜3）、事業所ごとの行（番号・名称・総費用額・利用者負担額・管理結果後利用者負担額）。うちの行（事業所番号 1951200672）も必ず入れる。
   - 氏名は伏せ字（「三●邦●」など）なので使わない。児童は受給者証番号で決まる。
   - 帳票に書かれたサービス提供月を `formYearMonth`（YYYYMM）に入れる（令和8年9月分 → `202609`）。
   - 送付状の連絡事項で、帳票と食い違うこと・付いているはずの帳票がないことなどに気づいたら `concerns` に書く。
   - 上限管理と関係のない FAX は `forms: []` にして `note` に中身を一言で書く（翌朝に読み直さないため）。
6. **記録して知らせる**：次の形の JSON を作業用フォルダに書き、`npx tsx scripts/fax-check.ts record <JSON のパス>` を実行する。
   出力（待つ先・届いた・未着・違和感・送った LINE）をそのまま実行結果として残す。
7. **後片付け**：ダウンロードした PDF・JSON を削除し、開いたタブを閉じる。

```json
{
  "yearMonth": "202609",
  "faxes": [
    {
      "faxFile": "FAX_20261002_1790907980_472.pdf",
      "receivedAt": "2026-10-02T11:28:00+09:00",
      "forms": [
        {
          "formType": "copay_list",
          "formYearMonth": "202609",
          "officeNumber": "1951200631",
          "officeName": "ココロン富士吉田",
          "entries": [{ "certificateNumber": "1920208996", "totalCost": 72720, "copayAmount": 4600 }]
        },
        {
          "formType": "result",
          "formYearMonth": "202609",
          "officeNumber": "1951305125",
          "officeName": "放課後デイサービス事業所ぱるっこ",
          "entries": [{
            "certificateNumber": "1943005437",
            "result": "2",
            "offices": [
              { "officeNumber": "1951305125", "officeName": "ぱるっこ", "totalCost": 75430, "copayAmount": 7543, "managedCopayAmount": 7543 },
              { "officeNumber": "1951200672", "officeName": "ぷらすわん", "totalCost": 124150, "copayAmount": 12415, "managedCopayAmount": 12415 }
            ]
          }]
        }
      ],
      "concerns": ["送付状に書かれた利用日数と一覧表の児童が合わない など"],
      "note": ""
    }
  ],
  "concerns": []
}
```

## 止まったとき

Chrome につながらない・you.first の Gmail が見つからない・ダウンロードできないなどで FAX を確かめられなかったときは、
`{"yearMonth": "YYYYMM", "faxes": [], "concerns": ["（何が起きて確かめられなかったか）"]}` を記録すると、請求担当へ LINE で届く。
