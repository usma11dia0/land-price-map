---
name: dev-server
description: Vercel開発サーバーを起動（API対応）
---

# 開発サーバー起動

`vercel dev` でローカル開発サーバーを起動する。

## 手順

1. `.env.local` に必要な環境変数が設定されているか確認
   - `REINFOLIB_API_KEY`: 不動産情報ライブラリAPIキー
   - `GOOGLE_API_KEY`: Google Maps Platform APIキー（Vercel環境変数で管理）
2. `vercel dev` をバックグラウンドで起動
3. http://localhost:3000 でアクセス可能であることを確認

## 注意事項

- **地価情報APIなどを使う場合は必ず `vercel dev` を使用**
- `npm run serve`（http-server）ではAPIプロキシが動作せずCORSエラーが発生する
- 初回起動時はVercelプロジェクトとの連携を聞かれる → 既存プロジェクトを選択
