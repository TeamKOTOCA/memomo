# memomo

高機能ブラウザメモサイトOSSです。Notion風のライブMarkdown編集、階層タグ（フォルダー）管理、検索/AI検索補助を提供します。

## 主要機能
- ライブMarkdown適用（編集中その場で見た目反映）
- 左側アイコンタブ: 新規メモ / 検索 / その他 / アセットストレージ / 設定
- アセット貼り付け + ストレージ保存 + 再挿入
- 階層タグ（例: `project/memomo/spec`）による整理
- ノート作成/更新（楽観的同時実行制御）
- 競合時の `409 VERSION_CONFLICT` 応答と `note_conflicts` への両保持
- SQLite FTS5 検索 + AI検索補助（キーワード生成と要約のみ）

## 起動
```bash
npm start
```

## テスト
```bash
npm test
```

## API概要
- `POST /notes`
- `PUT /notes/:id`
- `GET /notes/:id`
- `GET /notes?folder=project/memomo`
- `GET /search?q=keyword`
- `POST /ai-search`
- `GET /api/folders`
