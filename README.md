# 地価情報マップ

## 概要

日本の地価情報を地図上で確認できるWebアプリケーションです。住所や施設名を検索して地図上にマーカーを表示し、周辺の地価情報やストリートビュー画像を確認できます。

🌐 **公開URL**: https://land-price-map.vercel.app/

## 機能

### 🔍 住所・施設検索
- **Google Geocoding API**: 番地レベルの精度で住所検索
- **Google Places API**: 施設名・駅名などの検索
- **国土地理院API**: 町丁目レベルの住所検索（フォールバック）
- **Nominatim API**: OpenStreetMap ベースの検索（最終フォールバック）

### 🗺️ 地図機能
- **Leaflet**: インタラクティブな地図表示
- **クリックでピン移動**: 地図をクリックして任意の地点にピンを設置
- **ズームコントロール**: 右下に配置

### 🔗 外部リンク
- **路線価**: 全国地価マップ（固定資産税路線価）への連携
- **Googleマップ**: 選択地点をGoogleマップで表示

### 📷 Google Street View
- **周辺写真表示**: ピンの地点のストリートビュー画像を表示
- **撮影日表示**: 画像右下に撮影年月を表示
- **方角調整**: スライダーで360°視点を変更可能

### ⚙️ API使用量管理
- **月次使用量追跡**: ローカルストレージで管理
- **自動リセット**: 毎月1日に自動リセット
- **累計表示**: 全期間の累計使用回数を表示
- **警告表示**: 70%で警告、90%で危険表示

## ファイル構成

```
├── index.html              - メインHTML
├── src/                    - TypeScriptソースコード
│   ├── app.ts              - アプリケーション初期化
│   ├── map.ts              - 地図操作
│   ├── search.ts           - 検索機能
│   ├── api.ts              - API呼び出し
│   ├── storage.ts          - ローカルストレージ管理
│   ├── ui.ts               - UI操作（Street View含む）
│   ├── config.ts           - 設定（※Git管理外）
│   ├── config.example.ts   - 設定テンプレート
│   └── types.ts            - 型定義
├── dist/                   - コンパイル済みJS（※Git管理外）
├── css/
│   └── styles.css          - スタイルシート
├── api/                    - Vercel Serverless Functions
│   ├── geocode.ts          - Google Geocoding APIプロキシ
│   ├── places.ts           - Google Places APIプロキシ
│   ├── streetview.ts       - Street View Static APIプロキシ
│   └── streetview-metadata.ts - Street View Metadata APIプロキシ
├── vercel.json             - Vercel設定
├── package.json            - npm設定
├── tsconfig.json           - TypeScript設定
├── CLAUDE.md               - Claude Code用ルール
└── README.md               - このファイル
```

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 設定ファイルの作成

```bash
cp src/config.example.ts src/config.ts
```

`src/config.ts` を編集してAPIキーを設定してください。

### 3. ビルド

```bash
npm run build
```

### 4. 開発サーバー起動

```bash
npm run dev
```

ブラウザで http://localhost:8080 を開きます。

## 開発コマンド

| コマンド | 説明 |
|----------|------|
| `npm run build` | TypeScriptをコンパイル |
| `npm run watch` | 自動コンパイル（監視モード） |
| `npm run dev` | 開発サーバー起動 |
| `npm run start` | ビルド＆サーバー起動 |

## デプロイ（Vercel）

### 環境変数

Vercelの環境変数に以下を設定:

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_API_KEY` | Google Maps Platform APIキー |

### 必要なGoogle API

以下のAPIをGoogle Cloud Consoleで有効化:

1. **Geocoding API** - 住所検索
2. **Places API (New)** - 施設検索
3. **Street View Static API** - ストリートビュー画像

## 設定

`src/config.ts` で以下を設定できます：

| 設定項目 | 説明 | デフォルト値 |
|----------|------|--------------|
| `GOOGLE_API_KEY` | Google Maps Platform APIキー | - |
| `API_USAGE_LIMIT` | 月間API使用上限 | 9000 |

## 使用技術

- **TypeScript**: 型安全な開発
- **Leaflet**: 地図表示ライブラリ
- **Google Maps Platform API**: Geocoding / Places / Street View
- **国土地理院 ジオコーディングAPI**: 住所検索（無料）
- **Nominatim API**: OpenStreetMap ジオコーディング（無料）
- **Vercel**: ホスティング＆Serverless Functions

## API使用量について

### Google Maps Platform 無料枠（月間）

| API | 無料枠 |
|-----|--------|
| Geocoding API | 10,000リクエスト |
| Places API (Text Search) | $5相当 |
| Street View Static API | 10,000リクエスト |
| Street View Metadata API | 10,000リクエスト |

### アプリ内の使用量管理

- 使用量はブラウザのローカルストレージに保存
- 毎月1日に自動リセット
- 設定画面で使用状況を確認可能

## 外部リンク先

- **全国地価マップ**: https://www.chikamap.jp/
- **国土地理院**: https://www.gsi.go.jp/

## ライセンス

MIT
