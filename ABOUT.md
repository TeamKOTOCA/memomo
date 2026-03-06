

# memomo

## Detailed Technical Specification for Codex Implementation

---

# 0. プロジェクト定義

memomo は以下を満たす：

* 高速サーバ中心構成
* PWAによる完全オフライン編集可能
* タグは階層フォルダとして扱う
* SQLite + FTS5使用
* AIは検索補助専用
* フルスナップショット履歴保存
* 楽観的同時実行制御
* 競合時は両保持（上書き禁止）

---

# 1. システム構成

## 1.1 構成図

```
Client (PWA)
  - React UI
  - IndexedDB (offline storage)
  - Service Worker
  - Local search fallback

Server
  - REST API
  - SQLite (Primary DB)
  - FTS5
  - AI Search Module
```

---

# 2. データベース設計（Server）

## 2.1 notes

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0
);
```

制約：

* versionは更新ごとに+1
* 削除は論理削除のみ

---

## 2.2 note_versions

```sql
CREATE TABLE note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

保存ルール：

* notes更新前に必ず保存
* 差分保存は禁止
* 復元可能であること

---

## 2.3 folders（タグ＝フォルダ）

タグは階層文字列で表現。

例：

* school/math
* project/memomo/spec
* diary/2026/03

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL
);
```

---

## 2.4 note_folders

```sql
CREATE TABLE note_folders (
  note_id TEXT NOT NULL,
  folder_id TEXT NOT NULL
);
```

仕様：

* 1ノート複数所属可
* フォルダ削除時は関連付けのみ削除

---

## 2.5 FTS5

```sql
CREATE VIRTUAL TABLE notes_fts
USING fts5(title, content, content='notes', content_rowid='rowid');
```

トリガー：

```sql
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content)
  VALUES (new.rowid, new.title, new.content);
END;
```

UPDATE, DELETEも同様に定義。

---

## 2.6 note_conflicts

```sql
CREATE TABLE note_conflicts (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  local_content TEXT NOT NULL,
  remote_content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved INTEGER DEFAULT 0
);
```

---

# 3. API設計

## 3.1 Create Note

POST /notes

Body:

```json
{
  "title": "string",
  "content": "string",
  "folders": ["school/math"]
}
```

Response:

```json
{
  "id": "uuid",
  "version": 1
}
```

---

## 3.2 Update Note

PUT /notes/{id}

Body:

```json
{
  "content": "string",
  "version": 3
}
```

処理：

1. DBのversion取得
2. 一致 → 更新
3. 不一致 → 409 Conflict

---

## 3.3 Conflict Response

```json
{
  "error": "VERSION_CONFLICT",
  "server_version": 5,
  "server_content": "..."
}
```

クライアントは note_conflicts 作成。

---

## 3.4 Search

GET /search?q=keyword

サーバ処理：

```sql
SELECT * FROM notes_fts
WHERE notes_fts MATCH ?
LIMIT 10;
```

---

## 3.5 AI Search

POST /ai-search

Body:

```json
{
  "query": "自然言語"
}
```

フロー：

1. AIが検索キーワード生成
2. FTS検索
3. 上位5件取得
4. AIが要約生成
5. 要約返却

AIはDB全文取得禁止。

---

# 4. クライアント設計（PWA）

## 4.1 IndexedDB構造

* notes_cache
* pending_updates
* conflicts_local

---

## 4.2 オフライン更新アルゴリズム

1. 編集
2. IndexedDB保存
3. pending_updates追加
4. オンライン復帰時：

   * pending順にAPI送信
   * 競合ならconflicts_local保存

---

# 5. 同期アルゴリズム

楽観的同時実行制御。

擬似コード：

```
if client_version == server_version:
    update
else:
    create conflict record
    return 409
```

自動マージ禁止。

---

# 6. フォルダUI仕様

* 左ペインツリー表示
* path文字列を / で分割
* 展開折りたたみ可能
* フォルダ選択時：

```sql
SELECT notes.*
FROM notes
JOIN note_folders ON notes.id = note_folders.note_id
JOIN folders ON folders.id = note_folders.folder_id
WHERE folders.path LIKE 'school/math%'
```

---

# 7. パフォーマンス要件

* FTS検索 < 500ms
* ノート保存 < 200ms
* 同期処理 非同期実行
* 大量ノート（5万件）で動作保証

---

# 8. 非機能要件

* データ破壊ゼロ
* 自動保存（3秒デバウンス）
* 削除は論理削除
* VACUUM定期実行

---

# 9. AI制限事項

AIは：

* 検索クエリ生成
* 要約生成

のみ。

禁止事項：

* DB書き込み
* ノート改変
* フォルダ操作

---

# 10. 開発優先順位

1. Server + SQLite基盤
2. Memo CRUD
3. Folder階層UI
4. FTS検索
5. PWAオフライン
6. 同期
7. AI検索

---

# 11. 明確な境界定義

memomo は：

* ナレッジ管理ツール
* 思考ログ保存装置
* 高速検索システム

であり、

* タスク管理ツールではない
* コラボレーション特化ではない
* 自動整理AIではない
