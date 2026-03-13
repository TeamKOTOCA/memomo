# MEMOMO - 爆速メモをはじめとする個人的ツール群



## 1. プロジェクト概要



エックスサーバー（PHP 8.x / MySQL 8.0）上に構築する、自分専用の多機能Webアプリ基盤。

**「爆速・軽量・実用的」**を最優先とし、認証基盤の上に「Notion風メモ」と「サービス監視」を同居させる。



## 2. 技術スタック



* **Backend:** PHP 8.x (Stateless / API-centric)

* **Database:** MySQL 8.0 (Storage: 2GB 推奨 / 画像はファイル保存)

* **Frontend:** HTML5, Tailwind CSS (CDN), Alpine.js or Vue.js (CDN)

* **Editor:** Editor.js (Block-style editor)

* **Communication:** Fetch API (JSONベースのSPA構成)



## 3. ディレクトリ・インフラ構造



```text

public_html/

├── .htaccess          # HTTPS強制。ただし /static/ 配下のみHTTPを許可

├── index.php          # メインアプリ（SPA本体）

├── api.php            # APIエンドポイント（Router）

├── auth.php           # セッション管理・認証ロジック

├── assets/            # JS/CSS, Editor.jsプラグイン

├── uploads/           # メモ用画像保存先

├── apps/              # 各種サブ機能

│   ├── memo/          # Notion風メモロジック

│   └── monitor/       # ステータス監視ロジック

└── static/            # 自宅鯖用HTTP配布エリア（HTTPSリダイレクト除外）

    └── boot/          # 古いwget等からアクセスする静的ファイル



```



## 4. 主要機能の要件



### A. 共通認証基盤



* セッションベースのログイン管理。

* パスワードは `password_hash` で管理。

* `/api.php` へのリクエストは、すべて `auth.php` でログイン状態を検証すること。



### B. Notion風メモアプリ



* **Editor.js:** ブロック形式のエディタ。JSON形式でDB（`content_json`）に保存。

* **階層タグ管理:** `work/project/task` のようなパス形式の文字列で管理。フロントエンドでパンくずリストやフォルダ風にパースして表示。

* **爆速UI:** ページ遷移なしのSPA。オートセーブ機能。

* **画像処理:** ドラッグ&ドロップで `/uploads/` に保存し、エディタに即時反映。



### C. サービス監視（ステータスページ）



* 登録したIP/URLに対し、PHPの `fsockopen` または `curl` で疎通確認。

* エックスサーバーのCron（1分毎）を使用して定期チェックし、結果をDBに記録。

* ダッシュボード上に「稼働中/ダウン」を色分け表示。



### D. 自宅サーバー支援（HTTP通信）



* `.htaccess` により `/static/boot/` 配下のみ例外的にHTTP（非SSL）通信を許可。

* 古いOSの `wget` から設定ファイルをノーガードで取得可能にする。



## 5. Codexへの指示事項



1. まずはこの構造に基づき、`notes` テーブルと `monitoring` テーブルの **SQL定義** を作成せよ。

2. 次に、ログイン機能と `api.php` の **スケルトン（ルーティング処理）** を作成せよ。

3. フロントエンドは `index.php` 1枚に Tailwind と Editor.js を読み込み、**「爆速で動く」** 最小限のプロトタイプから着手せよ。



---

### 管理

共通仕様などで不明確な点はFORUSER.mdで質問などをするようにし、ABOUT.mdはソフトウェアのすべての管理を行う。タスクの管理はTASKS.mdで行う。