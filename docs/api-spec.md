# 不動産情報ライブラリ API 仕様書

本ドキュメントは、land-price-map アプリケーションで使用している **不動産情報ライブラリ API（国土交通省）** の仕様をまとめたものです。

---

## 概要

| 項目 | 内容 |
|------|------|
| 提供元 | 国土交通省 不動産情報ライブラリ |
| API種別 | REST API（GeoJSON） |
| 公式サイト | https://www.reinfolib.mlit.go.jp/ |
| API仕様（公式） | https://www.reinfolib.mlit.go.jp/ex-api/ |
| 認証方式 | APIキー（サブスクリプションキー） |

---

## 認証

| 項目 | 値 |
|------|-----|
| ヘッダー名 | `Ocp-Apim-Subscription-Key` |
| 値 | 環境変数 `REINFOLIB_API_KEY` に設定されたAPIキー |
| 取得方法 | 不動産情報ライブラリの開発者ページでAPIキーを申請 |

**認証エラー時**: HTTP 401 が返却される。

---

## エンドポイント

### XPT002: 地価公示・都道府県地価調査（タイルベース）

本アプリで使用しているメインのエンドポイント。

```
GET https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002
```

#### リクエストパラメータ

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|-----|------|------|-----|
| `response_format` | string | Yes | レスポンス形式 | `geojson` |
| `z` | integer | Yes | ズームレベル（13-15、本アプリは13を使用） | `13` |
| `x` | integer | Yes | タイルX座標 | `7276` |
| `y` | integer | Yes | タイルY座標 | `3225` |
| `year` | integer | Yes | 対象年度 | `2025` |
| `priceClassification` | integer | No | 価格区分 | `0` or `1` |

#### priceClassification の値

| 値 | 区分 | 説明 |
|----|------|------|
| `0` | 地価公示 | 毎年1月1日時点、3月頃公表（国土交通省） |
| `1` | 都道府県地価調査 | 毎年7月1日時点、9月頃公表（都道府県） |
| 省略 | 両方 | 地価公示と都道府県地価調査の両方を返却 |

#### タイル座標について

- Web Mercator（EPSG:3857）のXYZタイル座標系
- 本アプリでは **ズームレベル13** を使用（`src/landPrice.ts` の `API_ZOOM_LEVEL`）
- APIはズームレベル **13〜15** をサポート（z=12以下はHTTP 400）
- z=13: 約4km×4km/タイル、z=14: 約2km×2km、z=15: 約1km×1km
- 緯度経度→タイル座標の変換式:
  ```
  n = 2^zoom
  x = floor((lon + 180) / 360 * n)
  y = floor((1 - log(tan(lat_rad) + 1/cos(lat_rad)) / π) / 2 * n)
  ```

#### レスポンス形式

GeoJSON FeatureCollection:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [139.7671, 35.6812]  // [経度, 緯度]
      },
      "properties": {
        "point_id": "00001",
        "prefecture_name_ja": "東京都",
        "u_current_years_price_ja": "5,200,000",
        ...
      }
    }
  ]
}
```

---

## レスポンスプロパティ一覧

### 基本情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `point_id` | string | 地価ポイント固有ID | `"00001"` |
| `prefecture_code` | string | 都道府県コード | `"13"` |
| `prefecture_name_ja` | string | 都道府県名 | `"東京都"` |
| `city_code` | string | 市区町村コード | `"13101"` |
| `city_county_name_ja` | string | 市郡名 | `"千代田区"` |
| `ward_town_village_name_ja` | string | 区町村名 | `""` |
| `place_name_ja` | string | 地名 | `"丸の内"` |
| `standard_lot_number_ja` | string | 標準地番号 | `"千代田-1"` |
| `location_number_ja` | string | 所在地番号 | `"5-1"` |
| `residence_display_name_ja` | string | 住居表示 | `"丸の内1-1-1"` |

### 価格情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `target_year_name_ja` | string | 対象年名 | `"令和7年"` |
| `u_current_years_price_ja` | string | 当年価格（円/m²） | `"5,200,000"` |
| `last_years_price` | number | 前年価格（円/m²） | `5100000` |
| `year_on_year_change_rate` | number | 前年比変動率（%） | `2.0` |
| `land_price_type` | number | 地価種別 | `0` or `1` |

### 土地情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `use_category_name_ja` | string | 用途区分 | `"商業地"` |
| `u_cadastral_ja` | string | 地積（m²） | `"1,200"` |
| `building_structure_name_ja` | string | 建物構造 | `"SRC"` |
| `u_ground_hierarchy_ja` | string | 地上階数 | `"12"` |
| `u_underground_hierarchy_ja` | string | 地下階数 | `"3"` |
| `frontage_ratio` | number | 間口比 | `1.5` |
| `depth_ratio` | number | 奥行比 | `1.0` |
| `usage_status_name_ja` | string | 利用状況 | `"事務所"` |
| `current_usage_status_of_surrounding_land_name_ja` | string | 周辺の利用状況 | `"高層事務所ビル等が建ち並ぶ商業地域"` |

### 道路情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `front_road_name_ja` | string | 前面道路名 | `"区道"` |
| `front_road_azimuth_name_ja` | string | 前面道路方位 | `"南"` |
| `front_road_width` | number | 前面道路幅員（m） | `15.0` |
| `front_road_pavement_condition` | string | 舗装状況 | `"舗装"` |
| `side_road_azimuth_name_ja` | string | 側道方位 | `"西"` |
| `side_road_name_ja` | string | 側道名 | `"区道"` |

### 交通情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `nearest_station_name_ja` | string | 最寄駅名 | `"東京"` |
| `proximity_to_transportation_facilities` | string | 交通施設との接近状況 | `"近接"` |
| `u_road_distance_to_nearest_station_name_ja` | string | 最寄駅距離 | `"200m"` |

### 法規制情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `area_division_name_ja` | string | 区域区分 | `"市街化区域"` |
| `regulations_use_category_name_ja` | string | 用途地域 | `"商業地域"` |
| `regulations_altitude_district_name_ja` | string | 高度地区 | `""` |
| `regulations_fireproof_name_ja` | string | 防火地域 | `"防火地域"` |
| `u_regulations_building_coverage_ratio_ja` | string | 建蔽率 | `"80%"` |
| `u_regulations_floor_area_ratio_ja` | string | 容積率 | `"1300%"` |
| `regulations_forest_law_name_ja` | string | 森林法 | `""` |
| `regulations_park_law_name_ja` | string | 公園法 | `""` |

### インフラ情報

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `gas_supply_availability` | string | ガス供給 | `"有"` |
| `water_supply_availability` | string | 水道供給 | `"有"` |
| `sewer_supply_availability` | string | 下水道供給 | `"有"` |

### その他

| フィールド名 | 型 | 説明 | 例 |
|-------------|-----|------|-----|
| `pause_flag` | number | 休止フラグ | `0` |

---

## 鑑定評価書リンク

地価ポイントの鑑定評価書は以下のURLパターンでアクセス可能:

```
https://www.reinfolib.mlit.go.jp/landPrices_/realEstateAppraisalReport/{year}/{prefecture_code}/{year}{city_code}{lot_number}.html
```

- `{year}`: 年度（例: `2025`）
- `{prefecture_code}`: 都道府県コード（例: `13`）
- `{city_code}`: 市区町村コード
- `{lot_number}`: 番号

※ フロントエンドの `src/landPriceUI.ts` で構築。

---

## データ更新スケジュール

| 区分 | 基準日 | 公表時期 |
|------|--------|----------|
| 地価公示 | 毎年1月1日 | 毎年3月下旬 |
| 都道府県地価調査 | 毎年7月1日 | 毎年9月下旬 |

APIのデータ更新タイミングは公式に公開されていないが、公表後数日〜数週間以内に反映される。

---

## 本アプリでの利用方法

### 1. リアルタイム取得（`api/landprice.ts`）

ユーザーが地図を操作した際に、画面範囲内のタイルデータをAPIから取得。DB→APIフォールバック方式。

### 2. バッチ更新（`api/batch-update.ts`）

Vercel Cron Jobs で毎週月曜3:00（UTC）に主要10都市のデータを事前取得。

### 3. レート制限への配慮

- 1回のバッチ実行で最大10タイルに制限（`MAX_TILES_PER_RUN`）
- ズームレベル13を使用（1タイル≒4km×4km、z=15比で16倍の面積を1回で取得）
- Vercel Hobby プランの10秒実行制限を考慮
- API側のレート制限は明示されていないが、大量リクエストは避ける設計

---

## 環境変数

| 変数名 | 用途 | 設定場所 |
|--------|------|----------|
| `REINFOLIB_API_KEY` | API認証キー | `.env.local` / Vercel環境変数 |
| `DATABASE_URL` | NEON DB接続文字列 | `.env.local` / Vercel環境変数 |
| `CRON_SECRET` | Cron Job認証 | Vercel環境変数 |
