# MEMOMO - 爆速メモをはじめとする個人的ツール群

## 1. プロジェクト概要

エックスサーバー（PHP 8.x / MySQL 8.0）上に構築する、自分専用の多機能Webアプリ基盤。

**「爆速・軽量・実用的」**を最優先とし、認証基盤の上に「Notion風メモ」と「サービス監視」を同居させる。

## 2. 技術スタック

* **Backend:** PHP 8.x (Stateless / API-centric)
* **Database:** MySQL 8.0 (Storage: 2GB 推奨 / 画像はファイル保存)
* **Frontend:** HTML5, Tailwind CSS (CDN), Vanilla JS
* **Editor:** Editor.js (Block-style editor)
* **Communication:** Fetch API (JSONベースのSPA構成)
* **CI/CD:** GitHub Actions + FTP Deploy Action（Xserver向け）

## 3. ディレクトリ・インフラ構造

```text
public_html/
├── .htaccess                 # HTTPS強制。ただし /static/ 配下のみHTTPを許可
├── index.php                 # メインアプリ（SPA本体。ログイン + メモUI）
├── api.php                   # APIエンドポイント（Router）
├── auth.php                  # セッション管理・認証ロジック + DB接続
├── assets/                   # JS/CSS, Editor.jsプラグイン
├── uploads/                  # メモ用画像保存先
├── apps/
│   ├── memo/                 # Notion風メモロジック（今後拡張）
│   └── monitor/
│       └── check_all.php     # Cron 実行用監視チェック
└── static/                   # 自宅鯖用HTTP配布エリア（HTTPSリダイレクト除外）
    └── boot/                 # 古いwget等からアクセスする静的ファイル

db/
└── schema.sql                # users / notes / monitoring / monitoring_logs 定義

.github/workflows/
└── deploy-ftp.yml            # main push/manual で FTP 配備
```

## 4. API設計（現行）

### A. 認証

* `POST /api.php?action=auth.login`
* `POST /api.php?action=auth.logout`
* `GET  /api.php?action=auth.me`

### B. メモ

* `GET  /api.php?action=memo.list`
* `GET  /api.php?action=memo.load&id={id}`
* `POST /api.php?action=memo.save`（新規/更新兼用）

### C. 監視

* `GET  /api.php?action=monitor.list`
* `POST /api.php?action=monitor.save`
* `POST /api.php?action=monitor.run`
* `php public_html/apps/monitor/check_all.php`（Cron向け）

## 5. 主要機能の要件

### A. 共通認証基盤

* セッションベースのログイン管理。
* パスワードは `password_hash` で管理。
* `/api.php` へのリクエストは、ログイン必須エンドポイントで `require_login()` を通す。

### B. Notion風メモアプリ

* **Editor.js:** JSONを `content_json` に保存。
* **階層タグ管理:** `work/project/task` 形式。
* **爆速UI:** ページ遷移なし、デバウンス付きオートセーブ。

### C. サービス監視（ステータスページ）

* `fsockopen` / `curl` で疎通確認。
* Cronで定期実行し、結果を `monitoring_logs` に記録。

### D. 自宅サーバー支援（HTTP通信）

* `.htaccess` で `/static/boot/` 配下のみHTTPを許可。

### E. GitHub Actions + FTP 配備基盤

* `main` への push または手動実行で `public_html/` をFTP配備。
* 必須Secrets:
  * `FTP_SERVER`
  * `FTP_USERNAME`
  * `FTP_PASSWORD`
  * `FTP_SERVER_DIR`

---

### 管理

共通仕様などで不明確な点はFORUSER.mdで質問などをするようにし、ABOUT.mdはソフトウェアのすべての管理を行う。タスクの管理はTASKS.mdで行う。
