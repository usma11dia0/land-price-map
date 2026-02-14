---
name: add-feature
description: 新機能追加の標準ワークフロー（実装→ビルド→テスト→コミット）
---

# 新機能追加ワークフロー

機能追加時の標準的な開発フローを実行する。

## 手順

1. **要件確認**: ユーザーに機能の詳細を確認
2. **実装**: `src/` 内のTypeScriptファイルを作成・編集
3. **ビルド**: `npm run build` でTypeScriptをコンパイル、エラーがあれば修正
4. **テスト追加**: `tests/` にPlaywrightテストを追加
5. **テスト実行**: `npm test` でテストを実行、失敗があれば修正
6. **コミット**: 変更をgitにコミット

## ファイル構成ガイド

- TypeScriptソース: `src/` に配置
- スタイルシート: `css/` に配置
- Serverless Functions: `api/` に配置
- テスト: `tests/` に配置

## コミットメッセージ規約

```
feat: 機能の説明      # 新機能
fix: 修正の説明       # バグ修正
refactor: 変更の説明  # リファクタリング
test: テストの説明    # テスト追加・修正
docs: 変更の説明      # ドキュメント
```

## 注意事項

- コード変更後は必ず `npm run build` を実行
- `src/config.ts` はAPIキーを含むため `.gitignore` に含まれる
- `dist/` フォルダは `.gitignore` に含まれる
