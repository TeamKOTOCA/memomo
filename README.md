# memomo

ローカルAI統合型ナレッジ検索エンジンの Node.js 実装です。

## 実装済み
- SQLite + FTS5 スキーマ自動初期化
- `notes`, `note_versions`, `note_conflicts`, `note_tags`, `assets_meta`
- 楽観的同時実行制御（version一致時のみ更新）
- version不一致時のconflict記録（上書き禁止）
- ローカルLLM（llama.cpp）連携のタグ提案・検索要約（未設定時は安全フォールバック）
- クイックメモWeb UI（作成・タグ提案・検索）

## ローカルLLM設定（任意）
```bash
export MEMOMO_LLM_BIN=llama-cli
export MEMOMO_LLM_MODEL=/path/to/model.gguf
```

未設定時は、タグ提案と要約はローカルルールベースでフォールバックします。

## 起動
```bash
npm start
```

## テスト
```bash
npm test
```
