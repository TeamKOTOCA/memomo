# TASKS

## done (this iteration)
- [x] ローカルLLM（llama.cpp）連携でタグ候補生成と要約を実装
- [x] note_tagsを保存/検索フローへ統合
- [x] メモを素早く残せるWeb UI（作成・検索・要約表示）を追加
- [x] API/DB/UIを自動テストで検証

## done
- [x] Node.js版バックエンドへ移行（Python実装を置換）
- [x] SQLiteスキーマ初期化（notes / note_versions / note_conflicts / note_tags / assets_meta）
- [x] FTS5仮想テーブル + トリガー同期
- [x] ノート保存API（楽観ロック + conflict時両保持）
- [x] ノート取得API
- [x] 全文検索API（上位5件）
- [x] Node.jsテスト追加（DB/API）

## next
- [ ] conflict解消API/画面
- [ ] PWA化（Service Worker + IndexedDB）
- [ ] アセット管理UI（images/videos/audio）
