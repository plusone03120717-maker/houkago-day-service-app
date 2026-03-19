# 放課後等デイサービス・児童発達支援 施設運営管理アプリ 開発仕様書

## プロジェクト概要

放課後等デイサービスおよび児童発達支援事業所の運営を一元管理するWebアプリケーション（PWA対応）を開発する。
国保連請求、日々の記録、利用状況管理、送迎管理、保護者向け機能、個別支援計画、スタッフ勤務管理などを統合し、
施設運営業務を完結させるシステムを構築する。

### 基本情報

- **対応サービス種別**: 放課後等デイサービス、児童発達支援
- **施設規模**: 2〜3施設（将来の拡張も考慮）
- **データ構造**: 法人 > 施設（事業所） > 単位（ユニット）の3階層
  - 1施設に複数単位を登録可能（例：放デイ第1単位・第2単位、児発単位など）
  - 請求・定員管理・人員配置は単位ごとに管理
- **利用者**: スタッフ（管理者・一般スタッフ）+ 保護者
- **アプリ形態**: Webアプリ + PWA（プッシュ通知対応）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 14+ (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| バックエンド | Next.js API Routes (Route Handlers) |
| データベース | Supabase (PostgreSQL) |
| 認証 | Supabase Auth |
| ファイルストレージ | Supabase Storage（写真・動画・帳票PDF） |
| ホスティング | Vercel |
| AI機能 | Claude API (Anthropic) |
| PWA | next-pwa |
| 帳票出力 | PDF: react-pdf or puppeteer / CSV: 自前生成 |

---

## 権限モデル（3段階）

| ロール | 権限範囲 |
|--------|---------|
| **管理者** | 全機能アクセス。施設・単位の設定、スタッフ管理、請求、売上確認、全帳票出力 |
| **スタッフ** | 日々の記録（出席・送迎・活動記録・連絡帳）の登録・閲覧。担当児童の個別支援計画閲覧。自分のシフト確認 |
| **保護者** | 自分の子どもに関する情報のみ。連絡帳閲覧、利用申し込み、メッセージ、請求書・領収書閲覧 |

---

## 開発フェーズ

### フェーズ1（最優先・1ヶ月以内）

基盤となるデータモデル＋請求＋日々の記録＋送迎管理を構築する。

### フェーズ2

保護者向け機能（マイページ・連絡帳・メッセージ・通知）を構築する。

### フェーズ3

個別支援計画・スタッフ勤務管理・加算要件チェック等の高度な機能を構築する。

---

## データベース設計（主要テーブル）

### 組織・施設

```
organizations（法人）
├── id, name, address, phone, corporate_number

facilities（施設・事業所）
├── id, organization_id, name, facility_number（事業所番号10桁）, address, phone, service_types[]

units（単位）
├── id, facility_id, name, service_type（放デイ/児発）, capacity（定員）, unit_number
```

### ユーザー・スタッフ

```
users（認証ユーザー）
├── id, email, role（admin/staff/parent）, name, phone

staff_profiles（スタッフ詳細）
├── id, user_id, facility_id, qualification（資格：児童指導員/保育士/児発管/OT/PT/ST等）
├── employment_type（常勤/非常勤）, hire_date

staff_unit_assignments（スタッフ-単位 紐付け）
├── id, staff_id, unit_id
```

### 児童・利用者

```
children（児童情報 = 電子カルテ）
├── id, name, name_kana, birth_date, gender, address, school_name, grade
├── disability_type, allergy_info, medical_info, emergency_contact
├── notes（特記事項）, photo_url
├── created_at, updated_at

children_units（児童-単位 紐付け）
├── id, child_id, unit_id

parent_children（保護者-児童 紐付け）
├── id, user_id（保護者）, child_id

benefit_certificates（受給者証）
├── id, child_id, certificate_number, service_type
├── start_date, end_date（有効期限）
├── max_days_per_month（支給量）, copay_limit（負担上限月額）
├── copay_category（所得区分）, municipality（支給決定自治体）
├── alert_sent（期限アラート送信済みフラグ）
```

### 日々の記録・出席

```
daily_attendance（出席記録）
├── id, child_id, unit_id, date
├── status（出席/欠席/キャンセル待ち）
├── check_in_time, check_out_time
├── pickup_type（送迎有無：迎え/送り/両方/なし）
├── body_temperature, health_condition
├── created_by（記録者スタッフID）, updated_at

activity_programs（活動プログラムマスタ）
├── id, facility_id, name, description, category

daily_activities（日々の活動記録）
├── id, attendance_id, program_id, participated（参加有無）
├── achievement_level（達成度：1-5段階）, evaluation_notes
├── goal_id（個別目標との紐付け、NULLable）

daily_records（日常記録・特記事項）
├── id, attendance_id, record_type（日常記録/特記事項）
├── content, has_notable_flag（特記事項フラグ = trueで一覧で目立つ表示）
├── created_by, created_at

record_attachments（写真・動画添付）
├── id, daily_record_id or daily_activity_id, file_url, file_type（image/video）, caption
```

### 送迎管理

```
transport_vehicles（車両マスタ）
├── id, facility_id, name, capacity, driver_staff_id

transport_schedules（送迎スケジュール）
├── id, unit_id, date, vehicle_id, direction（迎え/送り）
├── driver_staff_id, departure_time, route_order

transport_details（送迎詳細）
├── id, schedule_id, child_id, attendance_id
├── pickup_location, pickup_time（予定）, actual_pickup_time
├── status（予定/乗車済/降車済）
├── parent_notified（保護者通知済みフラグ）
├── notification_sent_at
```

### 利用予定・スケジュール

```
usage_plans（利用予定の事前登録）
├── id, child_id, unit_id, day_of_week（曜日パターン）
├── start_date, end_date, is_active

usage_reservations（個別の利用予約）
├── id, child_id, unit_id, date
├── status（予約済/確定/キャンセル/キャンセル待ち）
├── requested_by（保護者からの申込みの場合）, requested_at
```

### 国保連請求

```
billing_monthly（月次請求ヘッダ）
├── id, unit_id, year_month, status（作成中/チェック済/CSV出力済/伝送済/確定）
├── created_at, finalized_at

billing_details（請求明細 = 児童ごと）
├── id, billing_monthly_id, child_id, certificate_id
├── total_days（利用日数）, total_units（単位数）
├── service_code, unit_price
├── additions[]（加算項目JSON: 送迎加算、児童指導員等加配加算 etc.）
├── copay_amount（利用者負担額）, billed_amount（請求額）
├── errors[]（AIエラーチェック結果JSON）

billing_actual_costs（実費請求）
├── id, child_id, unit_id, date, item_name（おやつ代、教材費等）
├── amount, billing_monthly_id

billing_invoices（保護者向け請求書・領収書）
├── id, child_id, year_month, invoice_type（請求書/領収書/代理受領通知書）
├── copay_amount, actual_cost_total, total_amount
├── issued_at, pdf_url
```

### 保護者向け機能

```
messages（メッセージ）
├── id, sender_id, receiver_id, child_id
├── content, attachments[], read_at
├── created_at

contact_notes（連絡帳 = サービス提供記録）
├── id, attendance_id, child_id, date, unit_id
├── content（活動内容・様子の記述）, photo_urls[]
├── ai_generated（AI生成フラグ）, ai_draft（AI下書き）
├── staff_id, parent_comment, parent_commented_at
├── published_at（保護者公開日時）

announcements（お知らせ一斉配信）
├── id, facility_id, title, content, target_type（全体/単位別）
├── published_at, created_by

push_subscriptions（PWAプッシュ通知登録）
├── id, user_id, endpoint, keys_json, created_at
```

### 個別支援計画（フェーズ3）

```
assessments（アセスメント）
├── id, child_id, assessment_date, assessor_staff_id
├── content_json（生活面・学習面・社会性・運動面・コミュニケーション等）
├── created_at

support_plans（個別支援計画書）
├── id, child_id, unit_id, plan_number
├── start_date, end_date（有効期間）
├── long_term_goal, short_term_goals[]
├── five_domains_support[]（5領域に即した支援内容JSON）
├── staff_id（作成者）, status（下書き/確定/モニタリング待ち）
├── monitoring_due_date（次回モニタリング期限）
├── alert_sent（期限アラート送信済み）
├── ai_draft_json（AI素案）

support_plan_goals（個別目標）
├── id, support_plan_id, goal_text, domain（5領域区分）
├── target_description, support_method

monitoring_records（モニタリング記録）
├── id, support_plan_id, monitoring_date, staff_id
├── goal_achievements[]（目標ごとの達成状況JSON）
├── overall_evaluation, next_plan_direction
├── meeting_notes（担当者会議議事録）
```

### スタッフ勤務管理（フェーズ3）

```
staff_shifts（シフト・出勤表）
├── id, staff_id, unit_id, date
├── shift_type（早番/遅番/通常/休み）
├── start_time, end_time, break_minutes
├── actual_start_time, actual_end_time（実績）

staffing_requirements（人員配置基準マスタ）
├── id, unit_id, service_type, min_staff_count
├── required_qualifications[]

addition_requirements（加算要件マスタ）
├── id, addition_name（児童指導員等加配加算、福祉専門職員配置等加算 etc.）
├── conditions_json（取得条件）

staffing_check_results（加算要件チェック結果）
├── id, unit_id, date, check_type（基準充足/加算取得可/減算対象）
├── result_json, warnings[]

treatment_improvement（処遇改善加算額）
├── id, unit_id, year_month, addition_type（処遇改善/特定処遇改善）
├── amount, cumulative_annual_amount
```

### 帳票・業務日報

```
daily_reports（業務日報）
├── id, unit_id, date, staff_on_duty[]
├── children_count, activities_summary
├── incidents, notes
├── auto_generated（自動生成フラグ）, created_by

generated_documents（生成済み帳票）
├── id, document_type（実績記録票/業務日報/勤務形態一覧表/個別支援計画書/モニタリング用紙/請求書/領収書）
├── related_id（関連レコードID）, unit_id, year_month
├── file_url（PDF/CSV）, generated_at
```

---

## フェーズ1 機能詳細

### F1-1: 基盤（認証・組織管理）

- Supabase Authによるメール認証（スタッフ招待制、保護者招待制）
- 法人・施設・単位のCRUD
- 単位ごとのサービス種別・定員設定
- ユーザー管理（ロール割り当て、施設・単位への紐付け）
- 施設切り替え機能（複数施設対応）

### F1-2: 児童情報管理

- 児童の基本情報登録（電子カルテ相当）
- 受給者証の登録・管理
- **受給者証有効期限アラート**: 30日前にダッシュボードに警告表示＋プッシュ通知
- 児童と単位の紐付け管理
- アレルギー・医療情報・特記事項の表示

### F1-3: 出席管理・日々の記録

- **出席表画面**: 日付・単位を選択し、その日の利用児童を一覧表示。ボタンで出欠席をワンタップ記録
- **入退室時間記録**: チェックイン/チェックアウト時刻の記録
- **体温・体調記録**: 入室時のバイタル
- **活動記録**: プログラム名選択＋参加有無＋達成度（5段階）＋評価コメント
- **日常記録**: フリーテキストでの日常の様子の記述
- **特記事項**: 特記事項フラグつきの記録。一覧画面で赤バッジ等で目立つ表示にする
- **写真・動画添付**: Supabase Storageにアップロード、記録に紐付け
- **記録漏れチェック**: 出席済みなのに記録未入力の児童をアラート表示

### F1-4: 利用状況管理

- **日別利用状況**: 日付指定で単位ごとの利用者一覧、出席人数、定員充足率を表示
- **月別利用状況表**: 自動集計。延べ利用人数をサービス種別・単位ごとに算出
- **定員超過チェック**: 定員超過減算の対象になっていないか自動判定
- **支給量残管理**: 児童ごとの月間残利用可能日数を表示

### F1-5: 送迎管理

- **車両マスタ管理**: 車両名・定員・担当ドライバーの登録
- **送迎組み画面**: 日付選択→利用予定児童をドラッグ&ドロップで車両に割り当て。定員オーバーの警告
- **送迎スケジュール表**: 車両ごとのルート・時間・乗車児童を一覧表示
- **送迎ステータス管理**: 乗車済み/降車済みのステータス更新
- **保護者通知**: 送迎出発時・到着時にプッシュ通知を自動送信
- **送迎記録の自動反映**: 送迎加算（片道/往復）の請求データに自動反映

### F1-6: 国保連請求

- **請求データ自動生成**: 日々の出席記録＋送迎記録＋加算情報から、月次の請求データを自動生成
- **単位ごとの請求**: 単位別に請求データを管理・出力
- **サービスコード自動判定**: サービス種別＋加算条件に基づいてサービスコードを自動セット
- **エラーチェック（AI活用）**: Claude APIで請求データの整合性チェック
  - 受給者証の有効期限チェック
  - 支給量超過チェック
  - 加算の算定要件充足チェック
  - 記録漏れ・矛盾の検出
- **CSV出力**: 国保連伝送ソフト（簡易入力システム）に取り込めるCSVフォーマットで出力
  - 介護給付費・訓練等給付費等明細書
  - サービス提供実績記録票
- **返戻・過誤・月遅れ請求対応**: ステータス管理で対応
- **実費請求管理**: おやつ代、教材費、課外活動費などを児童別・日別に登録

### F1-7: 帳票出力（フェーズ1対象分）

- **サービス提供実績記録票**: PDF自動生成。日々の記録から自動で入力済み。印刷対応
- **業務日報**: 出席表・スタッフ出勤・活動記録から自動生成。PDF出力
- **利用者負担額一覧**: 月次の保護者向け請求額一覧

### F1-8: ダッシュボード

- 今日の利用予定児童数（単位別）
- 出席未記録アラート
- 受給者証期限切れアラート
- 特記事項がある児童の一覧（赤バッジ表示）
- 送迎ステータスサマリー

---

## フェーズ2 機能詳細

### F2-1: 保護者マイページ

- 保護者専用ログイン（メール招待制）
- 自分の子どもの情報のみ閲覧可能
- 利用予定カレンダー表示
- 本日の送迎時間・活動予定の確認
- お知らせ（施設からの一斉配信）表示

### F2-2: 連絡帳（サービス提供記録）

- スタッフ側: 出席記録・活動記録から連絡帳を作成。写真添付可
- **AI文章生成**: Claude APIで日々の記録データをもとに連絡帳の文章を自動生成
  - 入力: 出席時間、参加プログラム、達成度、日常記録、特記事項
  - 出力: 保護者に伝わりやすい文章の下書き
  - スタッフが確認・編集してから公開
- 保護者側: マイページで閲覧＋コメント返信機能
- 過去の連絡帳を時系列で閲覧可能

### F2-3: メッセージ機能

- スタッフ⇔保護者の1対1メッセージ
- 既読・未読表示
- 画像・PDF添付対応
- プッシュ通知対応

### F2-4: 保護者からの利用申し込み

- マイページからカレンダーで利用希望日を申し込み
- 施設側で承認/却下
- キャンセル待ち対応
- 定員超過時の自動キャンセル待ち登録

### F2-5: 保護者向け請求・通知

- 請求書・領収書・代理受領通知書をマイページで閲覧
- PDF保存対応
- 入退室時・送迎時のプッシュ通知

---

## フェーズ3 機能詳細

### F3-1: 個別支援計画

- **アセスメント記録**: 生活面・学習面・社会性・運動面・コミュニケーション等の項目で記録
- **個別支援計画書作成**: 5領域に即した支援内容を入力。テンプレート対応
- **AI素案作成**: Claude APIでアセスメント＋日々の記録データから個別支援計画の素案を自動生成
  - 入力: アセスメント結果、過去の活動記録・達成度、前回計画のモニタリング結果
  - 出力: 長期目標・短期目標・支援内容の素案
  - スタッフが確認・編集して確定
- **モニタリング**: 計画の目標に対する達成状況を記録。次の計画への引き継ぎ
- **期限管理**: モニタリング期限の1ヶ月前にアラート通知
- **担当者会議議事録**: モニタリングと合わせて記録
- **帳票出力**: 個別支援計画書・モニタリング用紙のPDF出力

### F3-2: スタッフ勤務管理

- **シフト作成**: カレンダーUIで単位ごとのシフトを作成。勤務パターン（早番/遅番等）のテンプレート
- **加算要件チェック（特許HUG参考レベル）**:
  - 利用予定人数に対して人員配置基準を満たしているか自動判定
  - 児童指導員等加配加算の取得可否判定
  - 福祉専門職員配置等加算の取得可否判定
  - 基準未充足・減算対象の場合に警告表示
  - スタッフの資格情報を参照して適切な配置を提案
- **勤務形態一覧表**: 月次のシフトデータから自動生成。Excel（CSV）出力対応
- **出勤実績管理**: 予定と実績の差異記録

### F3-3: 処遇改善加算

- 月次請求データから処遇改善加算額を自動算出
- 施設ごと・月単位・年度累計の表示
- 処遇改善計画書・実績報告書の参考資料として活用

---

## AI機能仕様（Claude API）

### 共通設計

- モデル: claude-sonnet-4-20250514
- API呼び出しはサーバーサイド（Next.js API Routes）で行い、APIキーはサーバー側で管理
- ユーザー操作: 「AI生成」ボタンを押すと下書きを生成 → スタッフが確認・編集 → 確定
- 生成結果はDBに保存（ai_generated フラグ付き）

### AI-1: 連絡帳文章自動生成

```
入力データ:
- 児童名、日付
- 出席時間、体温・体調
- 参加した活動プログラム名と達成度
- 日常記録・特記事項のテキスト
- 添付写真の説明（任意）

出力: 保護者に向けた1日の活動報告文（200〜400文字程度）
トーン: 温かみのある丁寧な文体。ポジティブな表現を基本としつつ、特記事項は適切に伝える
```

### AI-2: 個別支援計画素案作成

```
入力データ:
- アセスメント結果
- 過去3ヶ月分の活動記録・達成度推移
- 前回の個別支援計画と目標
- 前回モニタリングの評価結果

出力:
- 長期目標（6ヶ月〜1年）の案
- 短期目標（3ヶ月）の案（5領域に即して）
- 具体的な支援内容・手立ての案
```

### AI-3: 国保連請求エラーチェック

```
入力データ:
- 月次請求データ全体（JSON）
- 児童の受給者証情報
- 出席記録・送迎記録
- スタッフ配置状況

チェック項目:
- 受給者証の有効期限内か
- 支給量を超過していないか
- サービスコードと実績の整合性
- 加算の算定要件を満たしているか
- 記録漏れ・矛盾の検出
- 過去の返戻パターンとの照合

出力: エラー・警告リスト（重要度付き）＋修正提案
```

---

## 画面一覧

### スタッフ向け画面

| 画面名 | パス | 概要 |
|--------|------|------|
| ダッシュボード | `/dashboard` | 今日の概況、アラート、クイックアクション |
| 出席表 | `/attendance` | 日付・単位選択 → 出欠席ワンタップ記録 |
| 日々の記録 | `/records/[childId]/[date]` | 児童ごとの詳細記録（活動・達成度・写真・特記事項） |
| 送迎組み | `/transport/schedule` | ドラッグ&ドロップで車両割り当て |
| 送迎管理 | `/transport/manage` | 本日の送迎状況リアルタイム管理 |
| 利用状況（日別） | `/usage/daily` | 日付指定の利用者一覧・充足率 |
| 利用状況（月別） | `/usage/monthly` | 月間集計・延べ人数 |
| 国保連請求 | `/billing` | 月次請求一覧、データ生成、エラーチェック、CSV出力 |
| 実費請求 | `/billing/actual-costs` | おやつ代等の登録・管理 |
| 連絡帳作成 | `/contact-notes/edit` | AI生成 → 編集 → 公開 |
| 児童情報 | `/children/[id]` | 電子カルテ。基本情報・受給者証・記録履歴 |
| 受給者証管理 | `/certificates` | 期限一覧・アラート |
| メッセージ | `/messages` | 保護者との個別メッセージ |
| お知らせ作成 | `/announcements` | 一斉配信 |
| 個別支援計画 | `/support-plans/[childId]` | アセスメント→計画作成→AI素案→モニタリング |
| シフト管理 | `/shifts` | カレンダーUI、加算要件チェック |
| 帳票出力 | `/documents` | 各種帳票のPDF/CSV生成・ダウンロード |
| 施設・単位設定 | `/settings/facilities` | 法人→施設→単位のCRUD |
| スタッフ管理 | `/settings/staff` | スタッフの登録・資格・権限設定 |

### 保護者向け画面

| 画面名 | パス | 概要 |
|--------|------|------|
| マイページトップ | `/parent` | お知らせ、今日の予定 |
| 連絡帳閲覧 | `/parent/contact-notes` | 日々の連絡帳 + コメント |
| 利用予定カレンダー | `/parent/calendar` | 利用申し込み・キャンセル |
| メッセージ | `/parent/messages` | 施設とのメッセージ |
| 請求書・領収書 | `/parent/invoices` | 月次の請求書・領収書閲覧 |
| 子どもの記録 | `/parent/records` | 活動写真・成長記録の閲覧 |

---

## 国保連CSVフォーマット仕様

国保連伝送ソフト（簡易入力システム）に取り込み可能なCSVを生成する。

### 出力ファイル

1. **介護給付費・訓練等給付費等明細書** / **障害児通所給付費・入所給付費等明細書**
2. **サービス提供実績記録票**

### CSVフォーマット注意事項

- 文字コード: Shift_JIS
- 改行コード: CRLF
- サービス種別コード: 放課後等デイサービス=63、児童発達支援=61
- 事業所番号: 10桁（施設テーブルのfacility_number）
- 受給者証番号: 受給者証テーブルから取得
- 日付フォーマット: YYYYMMDD（和暦変換は帳票出力時のみ）
- 金額: 半角数字、カンマなし

※ 具体的なCSVカラム定義は、国保連の最新インターフェース仕様書に準拠すること。
  開発時に最新の仕様書を参照し、障害児通所給付費のフォーマットに合わせて実装する。

---

## PWA設定

```json
{
  "name": "放デイ管理アプリ",
  "short_name": "放デイ管理",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "#4F46E5",
  "background_color": "#FFFFFF",
  "icons": [...]
}
```

### プッシュ通知対象イベント

- 送迎出発通知（保護者向け）
- 入退室通知（保護者向け）
- 連絡帳公開通知（保護者向け）
- メッセージ受信通知（双方向）
- 受給者証期限アラート（スタッフ・管理者向け）
- モニタリング期限アラート（スタッフ・管理者向け）
- 加算要件未充足警告（管理者向け）
- 記録漏れアラート（スタッフ向け）

---

## レスポンシブ対応方針

- **スタッフ**: PC（メイン）+ タブレット（出席記録・送迎管理で利用）
- **保護者**: スマートフォン（メイン）
- ブレークポイント: sm(640px), md(768px), lg(1024px), xl(1280px)
- タブレット最適化: 出席表はグリッドUIでタップしやすく
- スマホ最適化: 保護者向け画面はモバイルファースト設計

---

## セキュリティ要件

- Supabase RLS（Row Level Security）で権限制御
  - 保護者は自分の子どものデータのみアクセス可
  - スタッフは所属施設・単位のデータのみアクセス可
- HTTPS必須
- 児童の個人情報は暗号化を検討（特に医療情報・アレルギー情報）
- ファイルアップロード: 画像はリサイズ（最大1920px）、動画は容量制限（50MB）
- APIキー（Claude API等）はサーバーサイドのみ。環境変数管理
- セッション管理: Supabase Authのデフォルト + 自動ログアウト設定

---

## 開発上の注意事項

1. **単位（ユニット）を基本軸にする**: ほぼ全てのデータは単位に紐づく。クエリやUIは常に「どの単位のデータか」を意識する
2. **日々の記録が全ての起点**: 出席記録→活動記録→連絡帳→請求データ→帳票出力、すべてが出席データから始まる。出席テーブルの設計が最重要
3. **段階的に機能を有効化**: フェーズごとに機能をリリースできるよう、feature flagsやメニューの表示制御を組み込む
4. **国保連CSVは最新仕様を確認**: 障害福祉サービスのCSVフォーマットは年度改正で変わることがある。2024年度報酬改定の内容を反映すること
5. **AI機能はあくまで補助**: AIの生成結果は必ず人間（スタッフ）が確認・承認してから確定する設計とする
6. **オフライン対応（将来）**: PWAのService Workerでオフラインキャッシュを検討。送迎中に圏外でもステータス更新できるとベスト
7. **マルチテナント設計**: organization_idによるデータ分離を徹底。将来的に他法人にもSaaSとして提供できる設計
