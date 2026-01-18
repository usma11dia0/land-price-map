# プロジェクトルール

## ビルドについて

このプロジェクトはTypeScriptを使用しています。

### コード変更後の手順

1. `src/` 内のファイルを変更したら、必ず以下を実行：
   ```bash
   rm -rf dist
   npm run build
   ```

2. ブラウザでテストする場合は、必ず **Ctrl + Shift + R**（ハードリロード）を実行

## 開発コマンド

| コマンド | 説明 |
|----------|------|
| `npm run build` | TypeScriptをコンパイル |
| `npm run watch` | 自動コンパイル（監視モード） |
| `npm run dev` | 開発サーバー起動 |

## ファイル構成

```
src/    - TypeScriptソースコード
dist/   - コンパイル済みJavaScript（Git管理外）
css/    - スタイルシート
```

## 注意事項

- `dist/` フォルダは `.gitignore` に含まれています
- `src/config.ts` はAPIキーを含むため `.gitignore` に含まれています
