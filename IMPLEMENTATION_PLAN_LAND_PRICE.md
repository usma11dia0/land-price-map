# 地価公示・都道府県地価調査 表示機能 実装計画

## 概要

不動産情報ライブラリAPIを使用して、地図上に地価公示および都道府県地価調査のポイントを表示する機能を追加する。

## API情報

| 項目 | 内容 |
|------|------|
| エンドポイント | `https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002` |
| 認証ヘッダー | `Ocp-Apim-Subscription-Key: {APIキー}` |
| データ形式 | GeoJSON（XYZタイル方式） |
| 環境変数名 | `REINFOLIB_API_KEY` |

### APIパラメータ

| パラメータ | 説明 | 値 |
|-----------|------|-----|
| `response_format` | レスポンス形式 | `geojson` |
| `z` | ズームレベル | 13〜15 |
| `x`, `y` | タイル座標 | XYZ方式 |
| `year` | 対象年 | 最新年〜過去5年 |
| `priceClassification` | 地価区分 | 0=地価公示, 1=都道府県地価調査 |

---

## UI仕様

### 1. コントロールパネル（地図右側オーバーレイ）

```
┌─────────────────────┐
│ 地価情報            │
├─────────────────────┤
│ ☑ 地価公示（公示価格）│
│ ☑ 都道府県地価調査   │
├─────────────────────┤
│ [この範囲で検索]     │
└─────────────────────┘
```

- チェックボックスで表示/非表示を切り替え
- 両方選択可能
- 「この範囲で検索」ボタンでデータ取得

### 2. 検索範囲

- 画面中心から約20%の長方形範囲
- 範囲を示す矩形を地図上に表示（オプション）

### 3. マーカー表示

| 種類 | アイコン | 色 |
|------|---------|-----|
| 地価公示 | 丸（●） | 赤 |
| 都道府県地価調査 | 三角（▲） | 青 |

- アイコン上に標準地/基準地番号を表示
- クリックでモーダル表示

### 4. ローディング表示

- 検索中はスピナーまたは「読み込み中...」表示
- ボタンを非活性化

---

## モーダル仕様

### 表示項目

#### 基本情報
- 標準地/基準地番号
- 所在及び地番
- 住居表示

#### 価格情報
- 当年価格（円/㎡）
- 対前年変動率（%）
- 過去5年の価格推移
  - テーブル形式（上部）
  - 折れ線グラフ（下部）

#### 土地情報
- 地積（㎡）
- 利用現況
- 周辺の土地の利用現況

#### 道路情報
- 前面道路幅員（m）
- 前面道路の方位
- 前面道路の舗装状況
- 側道の有無・方位

#### 交通情報
- 交通施設との近接区分
- 最寄り駅名
- 最寄り駅までの距離

#### 法規制情報
- 用途区分
- 用途地域
- 建蔽率（%）
- 容積率（%）
- 防火・準防火
- 高度地区

### データなしの場合

- ハイフン（-）で表示

---

## ファイル構成（実装予定）

### 新規作成ファイル

```
src/
├── landPrice.ts          # 地価情報のメインロジック
├── landPriceTypes.ts     # 地価情報用の型定義
├── landPriceUI.ts        # 地価情報用UI（モーダル、コントロール）
└── landPriceChart.ts     # 価格推移グラフ描画

api/
└── landprice.ts          # Vercel Serverless Function（APIプロキシ）

css/
└── landprice.css         # 地価情報用スタイル（または style.css に追記）
```

### 修正ファイル

```
src/
├── app.ts                # 初期化処理に地価機能を追加
├── map.ts                # 地価マーカーレイヤーの管理
└── types.ts              # 共通型の追加（必要に応じて）

index.html                # モーダル・コントロールパネルのHTML追加
CLAUDE.md                 # 機能説明の追記
vercel.json               # API rewrites追加（必要に応じて）
```

---

## 実装ステップ

### Phase 1: API接続基盤

1. **Vercel Serverless Function作成** (`api/landprice.ts`)
   - APIキーをサーバーサイドで管理
   - リクエストパラメータのバリデーション
   - エラーハンドリング

2. **型定義作成** (`src/landPriceTypes.ts`)
   - APIレスポンスの型
   - 地価ポイントデータの型
   - UI状態の型

3. **環境変数設定**
   - Vercelに `REINFOLIB_API_KEY` を追加

### Phase 2: データ取得ロジック

4. **地価データ取得モジュール** (`src/landPrice.ts`)
   - 緯度経度からタイル座標への変換
   - 複数タイルのデータ取得
   - 過去5年分のデータ取得・統合
   - データのキャッシュ（オプション）

### Phase 3: UI実装

5. **コントロールパネル**
   - HTML追加（`index.html`）
   - CSS追加
   - チェックボックスのイベント処理
   - 「この範囲で検索」ボタンの実装

6. **マーカー表示** (`src/map.ts` 拡張)
   - カスタムアイコンの作成（赤丸、青三角）
   - マーカーレイヤーグループの管理
   - クリックイベントの設定

7. **詳細モーダル** (`src/landPriceUI.ts`)
   - モーダルHTML追加
   - データバインディング
   - 開閉処理

### Phase 4: グラフ表示

8. **価格推移グラフ** (`src/landPriceChart.ts`)
   - Chart.js または 軽量ライブラリの導入
   - 折れ線グラフの描画
   - レスポンシブ対応

### Phase 5: 統合・テスト

9. **アプリケーション統合** (`src/app.ts`)
   - 初期化処理の追加
   - イベントリスナーの設定

10. **テスト・調整**
    - 各種ブラウザでの動作確認
    - エラーケースの確認
    - パフォーマンス確認

---

## 技術詳細

### XYZタイル座標の計算

```typescript
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}
```

### 検索範囲の計算（画面中心から20%）

```typescript
function getSearchBounds(map: L.Map): L.LatLngBounds {
  const bounds = map.getBounds();
  const center = map.getCenter();

  const latDiff = (bounds.getNorth() - bounds.getSouth()) * 0.1; // 20%の半分
  const lonDiff = (bounds.getEast() - bounds.getWest()) * 0.1;

  return L.latLngBounds(
    [center.lat - latDiff, center.lng - lonDiff],
    [center.lat + latDiff, center.lng + lonDiff]
  );
}
```

### カスタムマーカーアイコン

```typescript
// 地価公示（赤丸）
const kojiIcon = L.divIcon({
  className: 'land-price-marker koji',
  html: '<div class="marker-circle"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// 都道府県地価調査（青三角）
const chosaIcon = L.divIcon({
  className: 'land-price-marker chosa',
  html: '<div class="marker-triangle"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 17]
});
```

---

## グラフライブラリの選択肢

| ライブラリ | サイズ | 特徴 |
|-----------|--------|------|
| Chart.js | ~60KB (gzip) | 高機能、広く使われている |
| uPlot | ~10KB (gzip) | 軽量、高速 |
| 自前実装（SVG） | 0KB | 最軽量、カスタマイズ自由 |

**推奨**: 軽量性を重視するなら自前SVG実装、機能性を重視するならChart.js

---

## エラーハンドリング

| ケース | 対応 |
|--------|------|
| APIエラー（401） | 「APIキーが無効です」メッセージ |
| APIエラー（その他） | 「データの取得に失敗しました」メッセージ |
| データなし | 「この範囲にデータがありません」メッセージ |
| ネットワークエラー | 「通信エラーが発生しました」メッセージ |
| 各フィールドがnull | ハイフン（-）で表示 |

---

## 注意事項

1. **APIレート制限**: 不動産情報ライブラリのレート制限を確認し、必要に応じてリクエスト頻度を制御

2. **過去データの取得**: 5年分のデータを取得するため、APIコールが増加。非同期並列処理で効率化

3. **マーカー数の制限**: 大量のポイントが表示される可能性があるため、クラスタリングの検討（MarkerCluster）

4. **モバイル対応**: コントロールパネルとモーダルのレスポンシブ対応

---

## 実装開始前の確認事項

- [ ] 不動産情報ライブラリAPIキーの取得確認
- [ ] Vercel環境変数の設定方法確認
- [ ] Chart.js使用の可否（または代替案）
- [ ] 実装の優先順位（MVP → 追加機能）

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-22 | 初版作成 |
