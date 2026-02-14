---
name: build-check
description: TypeScriptビルド＆型チェックを実行し、エラーがあれば修正を提案
---

# ビルド＆型チェック

TypeScriptプロジェクトのビルドを実行し、コンパイルエラーを確認・修正する。

## 手順

1. `npm run build` を実行してTypeScriptをコンパイル
2. エラーがあれば内容を分析し、修正を提案・実施
3. 修正後、再度 `npm run build` で成功を確認

## 注意事項

- `src/` 内のファイル変更後は必ずこのSkillを実行すること
- `dist/` フォルダはGit管理外（`.gitignore`に含まれる）
- ビルド成功後、ブラウザでは **Ctrl + Shift + R**（ハードリロード）が必要
