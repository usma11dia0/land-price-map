# プロジェクトルール

## ビルドについて

このプロジェクトはTypeScriptを使用しています。

### コード変更後の手順

1. `src/` 内のファイルを変更したら、必ず以下を実行：
   ```bash
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
src/           - TypeScriptソースコード
dist/          - コンパイル済みJavaScript（Git管理外）
css/           - スタイルシート
api/           - Vercel Serverless Functions
```

## 注意事項

- `dist/` フォルダは `.gitignore` に含まれています
- `src/config.ts` はAPIキーを含むため `.gitignore` に含まれています

## Vercelデプロイ

### 環境変数
- `GOOGLE_API_KEY`: Google Maps Platform APIキー

### Serverless Functions
- `api/geocode.ts` - Google Geocoding APIプロキシ
- `api/places.ts` - Google Places APIプロキシ
- `api/streetview.ts` - Street View Static APIプロキシ
- `api/streetview-metadata.ts` - Street View Metadata APIプロキシ

## 現在実装済みの機能

### 検索機能
- Google Geocoding API（住所検索）
- Google Places API（施設検索）
- 国土地理院API（フォールバック）
- Nominatim API（最終フォールバック）

### 地図機能
- Leaflet地図表示
- クリックでピン移動
- マーカーポップアップ

### 外部リンク
- 全国地価マップ（固定資産税路線価）
- Googleマップ

### Street View
- ピンの地点の写真表示
- 撮影日表示（右下）
- 方角スライダー（0-360°）

### API使用量管理
- 月次使用量追跡
- 毎月1日自動リセット
- 累計使用回数表示

## Git操作

```bash
# 変更をコミット
git add .
git commit -m "feat: 機能の説明"
git push origin main
```

Vercelは`main`ブランチへのプッシュで自動デプロイされます。
