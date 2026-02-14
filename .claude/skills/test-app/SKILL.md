---
name: test-app
description: Playwrightテストを実行し、結果を確認・失敗時は修正をガイド
---

# テスト実行

Playwrightを使ったE2Eテストを実行する。

## 使い方

引数でテストモードやフィルタを指定できる：

- 引数なし → `npm test`（ヘッドレス、高速）
- `headed` → `npm run test:headed`（ブラウザ表示）
- `ui` → `npm run test:ui`（UIモードでデバッグ）
- テスト名を指定 → `npx playwright test -g "テスト名"`

## 手順

1. 指定されたモードでテストを実行
2. 結果を確認し、失敗があれば原因を分析
3. 失敗テストの修正を提案・実施
4. 修正後、再テストで成功を確認

## 注意事項

- APIを使うテストは `vercel dev` が必要（Playwrightが自動起動する設定あり）
- テストファイルは `tests/` フォルダに配置
- テストレポート表示: `npx playwright show-report`
