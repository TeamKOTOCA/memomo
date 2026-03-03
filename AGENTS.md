了解。
そのまま実装フェーズに入れるレベルで、構成を明確にした企画書としてまとめる。

---

# ローカルAI統合型ナレッジ検索エンジン

## 企画書（実装仕様ドラフト）

---

## 1. 概要

本プロジェクトは、

> 「自分の知識を高速・正確に検索できるローカルAI統合ナレッジ基盤」

を構築することを目的とする。

特徴：

* SQLiteベースの軽量ローカルDB
* FTS5による高速全文検索
* 軽量ローカルLLMによる検索補助
* PWA対応によるオフライン利用
* 楽観的同時実行制御による安全な同期
* コンフリクト時の両保持＋手動マージ設計

---

## 2. 設計思想

### 2.1 AIは検索エンジンではない

* 検索は必ずDBで実行
* AIは検索クエリ生成と要約のみ担当
* 全文をAIに渡さない（上位N件のみ）

---

### 2.2 データ破壊を絶対に起こさない

* 競合時は上書き禁止
* 両バージョン保持
* 手動マージ可能

---

### 2.3 スケールは「個人拡張」前提

* 数千〜数万ノート想定
* 数GB未満のデータ規模
* アセットは外部保存

---

## 3. システム構成

```
[PWA Client]
    ↓
[API Layer]
    ↓
[SQLite]
    ├ notes
    ├ note_versions
    ├ note_tags
    ├ assets_meta
    └ FTS5 index

[Local LLM]
```

---

## 4. データベース設計

### 4.1 notes

```sql
notes (
    id TEXT PRIMARY KEY,
    content TEXT,
    content_hash TEXT,
    version INTEGER,
    updated_at INTEGER,
    device_id TEXT
)
```

---

### 4.2 note_versions（履歴）

```sql
note_versions (
    id TEXT PRIMARY KEY,
    note_id TEXT,
    content TEXT,
    content_hash TEXT,
    created_at INTEGER
)
```

* 保存時に全文スナップショット
* 差分保存は行わない

---

### 4.3 note_conflicts

```sql
note_conflicts (
    id TEXT PRIMARY KEY,
    note_id TEXT,
    base_version INTEGER,
    local_content TEXT,
    remote_content TEXT,
    created_at INTEGER
)
```

* 同期時にversion不一致なら記録

---

### 4.4 note_tags

```sql
note_tags (
    note_id TEXT,
    tag TEXT
)
```

---

### 4.5 assets_meta

```sql
assets_meta (
    id TEXT PRIMARY KEY,
    path TEXT,
    type TEXT,
    size INTEGER,
    created_at INTEGER
)
```

---

### 4.6 FTS5

```sql
CREATE VIRTUAL TABLE notes_fts
USING fts5(content, content='notes', content_rowid='rowid');
```

* トリガーで自動同期

---

## 5. アセット管理

### 5.1 保存方針

```
/data
  /assets
    /images
    /videos
    /audio
database.sqlite
```

* DBにBLOB保存しない
* パスのみ保持

---

## 6. 検索フロー（RAG設計）

### 6.1 通常検索

1. ユーザー入力
2. LLMがタグ候補生成
3. タグ絞り込み
4. FTS全文検索
5. 上位5件取得
6. LLMに渡して要約
7. 応答生成

---

### 6.2 制限

* AIに渡す総文字数上限設定
* タイムアウト管理
* キャッシュ有効化

---

## 7. 同期設計

### 7.1 同期方式

楽観的同時実行制御（Optimistic Concurrency）

---

### 7.2 同期フロー

1. クライアント送信（version含む）
2. サーバ側version比較
3. 一致 → 更新
4. 不一致 → conflict記録

---

### 7.3 コンフリクト処理

* 両バージョン保存
* 専用UIで差分表示
* 手動マージ
* マージ後、新version発行

---

## 8. diff設計

* フロント側で行単位diff
* ライブラリ利用
* 通常時は不要
* conflict時のみ使用

---

## 9. PWA設計

### 9.1 オフライン対応

* Service Worker導入
* UIキャッシュ
* IndexedDBに一時保存

---

### 9.2 オフライン編集

* ローカルに一時保存
* 再接続時に同期処理
* conflict発生時は両保持

---

## 10. 想定スケール

| 項目      | 想定    |
| ------- | ----- |
| ノート数    | 1万〜5万 |
| テキスト容量  | 数百MB  |
| FTS込みDB | 1GB未満 |
| アセット    | 外部保存  |

SQLiteで対応可能。

---

## 11. 将来拡張

* ベクトル検索追加
* 自動マージアルゴリズム
* CRDT移行（必要時のみ）
* マルチユーザー対応

---

## 12. 技術選定

| 層      | 技術                   |
| ------ | -------------------- |
| DB     | SQLite + FTS5        |
| フロント   | PWA (Service Worker) |
| ローカル保存 | IndexedDB            |
| AI     | 軽量LLM（7B以下想定）        |
| diff   | JSライブラリ              |

---

## 13. リスク

* コンフリクトUI複雑化
* 履歴肥大化
* LLM遅延

対策：

* 履歴アーカイブ
* タイムアウト管理
* キャッシュ導入

---

## 14. 結論

本設計は：

* ローカル完結型
* 高速検索重視
* データ安全性重視
* 将来拡張可能

という堅実なアーキテクチャである。

実装難易度は中程度。
段階的開発が可能。

---

タスクは /TASKS.mdで管理し、開発者向けのメッセージや質問、文句などはFORUSER.md
