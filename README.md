# 地価情報マップ

## 概要

日本の地価情報を地図上で確認できるWebアプリケーションです。住所を検索して地図上にマーカーを表示し、周辺の地価情報を確認できます。

## 機能

- **住所検索**: Google Geocoding API / 国土地理院APIを使用した住所検索
- **地図表示**: Leafletによるインタラクティブな地図表示
- **API使用量管理**: 日次の使用量追跡と上限管理
- **設定画面**: 使用状況の確認とリセット機能

## ファイル構成

```
├── index.html              - メインHTML
├── src/                    - TypeScriptソースコード
│   ├── app.ts              - アプリケーション初期化
│   ├── map.ts              - 地図操作
│   ├── search.ts           - 検索機能
│   ├── api.ts              - API呼び出し
│   ├── storage.ts          - ローカルストレージ管理
│   ├── ui.ts               - UI操作
│   ├── config.ts           - 設定（※Git管理外）
│   ├── config.example.ts   - 設定テンプレート
│   └── types.ts            - 型定義
├── dist/                   - コンパイル済みJS（※Git管理外）
├── css/
│   └── styles.css          - スタイルシート
├── package.json            - npm設定
├── tsconfig.json           - TypeScript設定
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

## 開発

### 自動コンパイル（ファイル変更を監視）

```bash
npm run watch
```

### ビルド

```bash
npm run build
```

### ビルド＆サーバー起動

```bash
npm run start
```

## 設定

`src/config.ts` で以下を設定できます：

| 設定項目 | 説明 | デフォルト値 |
|----------|------|--------------|
| `GOOGLE_API_KEY` | Google Maps Platform APIキー | - |
| `API_USAGE_LIMIT` | 日次API使用上限 | 100 |

## 使用技術

- **TypeScript**: 型安全な開発
- **Leaflet**: 地図表示ライブラリ
- **Google Geocoding API**: 住所検索
- **国土地理院 ジオコーディングAPI**: 住所検索（無料、フォールバック）

## API使用量について

アプリケーションは日次のAPI使用量を追跡します。

- 使用量はブラウザのローカルストレージに保存されます
- 日付が変わると自動的にリセットされます
- 設定画面から手動でリセットすることも可能です（テスト用）
- 使用量が上限の70%を超えると警告表示、90%を超えると危険表示になります

## データソース

- [国土交通省 地価公示](https://www.mlit.go.jp/totikensangyo/totikensangyo_fr4_000043.html)
- [国土交通省 都道府県地価調査](https://www.mlit.go.jp/totikensangyo/totikensangyo_fr4_000044.html)

## ライセンス

MIT
