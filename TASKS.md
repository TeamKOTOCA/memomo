🏁 マイルストーン 1: 基礎インフラと認証の構築
[x] T1.1: データベースセットアップ

notes, monitoring, users (+ monitoring_logs) テーブルの作成SQLを `db/schema.sql` として作成

[x] T1.2: セキュリティ・通信制御

`.htaccess` の作成（HTTPS強制 + /static/ 除外設定）

[x] T1.3: 認証基盤 (auth.php)

ログイン/ログアウト処理の実装 (password_hash)

セッションによるアクセス制限の実装

[x] T1.4: APIルーティング (api.php)

認証/メモ/監視APIの基本ルーティングと応答を実装


[x] T1.5: 初期設定UI & ソーシャルログイン

初回セットアップUI（管理者作成/基本設定/OAuth設定）を追加

Google/GitHub OAuthログインを追加

📝 マイルストーン 2: 爆速Notion風メモ (Memo App)
[x] T2.1: エディタ基本実装

index.php への Editor.js 導入

基本的なブロック（Paragraph, Header, List）の有効化

[x] T2.2: 保存・読込ロジック

JSONデータのDB保存処理 (Auto-save)

既存メモの取得とエディタへの展開

[x] T2.3: 階層タグシステム

path/to/tag 形式のタグ保存処理

フロントエンドでのパンくずリスト表示

[ ] T2.4: 画像アップロード機能

uploads/ への非同期保存

Editor.js Image Tool との連携

📡 マイルストーン 3: サービス監視 (Monitor App)
[x] T3.1: 監視ロジック作成

fsockopen / curl を使った疎通確認ロジック（API & Cron）

[ ] T3.2: 定期実行設定 (Cron)

エックスサーバーのサーバーパネルでCronを設定（1分毎）

[x] T3.3: 監視ダッシュボードUI

ステータス（稼働/停止）の視覚化表示

🚀 マイルストーン 4: デプロイ・運用基盤
[x] T4.1: GitHub Actions FTP配備

`.github/workflows/deploy-ftp.yml` を作成し、`public_html/` をFTPへ自動配備

[ ] T4.2: Secrets設定と初回デプロイ検証

FTP_SERVER / FTP_USERNAME / FTP_PASSWORD / FTP_SERVER_DIR を登録して手動実行で検証

🔧 マイルストーン 5: 自宅サーバー支援 & 仕上げ
[ ] T5.1: HTTP配布エリア疎通確認

古い wget 等から /static/boot/ へアクセスできるかテスト

[ ] T5.2: UI/UX ブラッシュアップ

Tailwind CSS によるダークモード対応・高速レスポンス化

[ ] T5.3: 全体統合テスト

各機能間の干渉がないか確認

📅 進捗ログ
2026-03-13: プロジェクト開始、ABOUT.md / TASKS.md 策定。
2026-03-13: 初期スケルトン作成（schema.sql, auth.php, api.php, index.php, .htaccess, deploy-ftp.yml）。
2026-03-13: メモ保存/読込・ログインUI・監視実行API/Cronスクリプトを追加。

2026-03-17: 初期設定UI（管理者/基本設定/OAuth）とGoogle/GitHubソーシャルログイン、監視ダッシュボードUIを追加。
