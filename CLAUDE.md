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
| `vercel dev` | **推奨** ローカル開発サーバー（API含む、http://localhost:3000） |
| `npm run serve` | 簡易サーバー（APIは動作しない、http://localhost:8080） |

### ローカル開発の注意

**地価情報API等を使う場合は必ず `vercel dev` を使用してください。**

`npm run serve`（http-server）では、APIプロキシが動作しないためCORSエラーが発生します。

```bash
# 1. 環境変数を設定（.env.local に REINFOLIB_API_KEY を設定）
# 2. vercel dev を起動
vercel dev
```

初回起動時はVercelプロジェクトとの連携を聞かれます。既存プロジェクトを選択してください。

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
- `REINFOLIB_API_KEY`: 不動産情報ライブラリAPIキー

### Serverless Functions
- `api/geocode.ts` - Google Geocoding APIプロキシ
- `api/places.ts` - Google Places APIプロキシ
- `api/streetview.ts` - Street View Static APIプロキシ
- `api/streetview-metadata.ts` - Street View Metadata APIプロキシ
- `api/landprice.ts` - 不動産情報ライブラリAPIプロキシ

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

### 地価情報表示
- 不動産情報ライブラリAPI連携
- 地価公示データ表示（赤丸マーカー）
- 都道府県地価調査データ表示（青三角マーカー）
- 詳細モーダル（価格、土地情報、道路情報、交通情報、法規制情報）
- 過去5年の価格推移（テーブル＋Chart.jsグラフ）
- 画面中心20%範囲での検索

## 動作確認

### 開発サーバー起動
```bash
vercel dev
```
http://localhost:3000 でアクセス可能（API含む）

### 自動テスト（Playwright）

| コマンド | 説明 | 用途 |
|----------|------|------|
| `npm test` | ヘッドレスで実行 | CI/CD、素早い確認 |
| `npm run test:headed` | ブラウザ表示で実行 | **動作を目視確認** |
| `npm run test:ui` | UIモードで実行 | デバッグ、ステップ実行 |

```bash
# 特定のテストのみ実行
npx playwright test tests/app.spec.ts

# 特定のテスト名を含むもののみ
npx playwright test -g "地価情報"

# テストレポートを表示
npx playwright show-report
```

### 手動確認チェックリスト
1. 住所検索が動作するか（例：「東京都千代田区丸の内1丁目」）
2. 地図上のクリックでピンが移動するか
3. 地価情報のチェックボックスをONにして「この範囲で検索」が動作するか
4. 地価マーカーをクリックして詳細モーダルが表示されるか
5. Street Viewボタンが動作するか
6. 外部リンク（路線価、Googleマップ）が正しく開くか

## Claude Code 開発ガイド

### 基本的な使い方

```bash
# プロジェクトフォルダで Claude Code を起動
cd d:\dev\land-price-map
claude
```

### 開発時の指示例

#### 機能追加
```
お気に入り地点を保存する機能を追加してください
```

#### バグ修正（エラーメッセージを含める）
```
マーカーをクリックするとエラーが出ます。
エラー: TypeError: rate.toFixed is not a function
at openLandPriceModal (landPriceUI.ts:248:47)
修正してください。
```

#### テスト追加
```
住所検索機能のE2Eテストを追加してください
```

#### テスト実行と修正
```
npm run test:headed を実行して、失敗したテストがあれば修正してください
```

### テスト実行後にサーバー起動（推奨フロー）

**テストを実行して、その後手動確認用にサーバーを起動：**
```
npm test を実行してテストを確認し、その後 vercel dev でサーバーを起動してください
```

これにより：
1. `npm test` - ヘッドレスモードで高速にテスト実行
2. `vercel dev` - http://localhost:3000 でサーバー起動
3. ブラウザで手動確認

### テスト実行オプション

| 指示 | 説明 |
|------|------|
| `npm test を実行` | ヘッドレスで高速テスト（推奨） |
| `npm run test:headed を実行` | ブラウザ表示でテスト |
| `npx playwright test --headed --workers=1 を実行` | 1つのブラウザで順番にテスト |
| `npm run test:ui を実行` | UIモードでデバッグ |

### 特定のテストだけ実行したい場合
```
npx playwright test -g "地価情報" を実行してください
```

### テストを追加して実行まで行う場合
```
地価情報モーダルの表示テストを追加して、npm test で確認後、vercel dev でサーバーを起動してください
```

### 開発フロー

1. **機能実装** → コード変更
2. **ビルド** → `npm run build`
3. **テスト追加** → `tests/` にテストを追加
4. **テスト実行** → `npm run test:headed`（目視確認）
5. **修正** → 失敗したテストを修正
6. **コミット** → `git add . && git commit -m "feat: 説明"`

### よく使う指示パターン

| やりたいこと | 指示例 |
|-------------|--------|
| 機能追加 | `〇〇機能を追加してください` |
| バグ修正 | `このエラーを修正してください: [エラーメッセージ]` |
| テスト追加 | `〇〇機能のテストを追加してください` |
| テスト実行 | `npm run test:headed を実行して結果を確認してください` |
| リファクタリング | `src/〇〇.ts を読みやすく整理してください` |
| 説明を求める | `src/landPrice.ts の fetchTileData 関数を説明してください` |

### 注意事項

- コード変更後は必ず `npm run build` を実行
- APIを使う機能のテストは `vercel dev` が必要（Playwrightが自動起動）
- テストファイルは `tests/` フォルダに配置
- 環境変数は `.env` または `.env.local` に設定（Git管理外）

## Git操作

```bash
# 変更をコミット
git add .
git commit -m "feat: 機能の説明"
git push origin main
```

Vercelは`main`ブランチへのプッシュで自動デプロイされます。
