/**
 * Vercel Serverless Function - バッチ更新
 * 全国の主要タイルを巡回して不動産情報ライブラリAPIからデータ取得→DBに保存
 * Vercel Cron Jobs で週1回自動実行
 *
 * 正規化テーブル対応: land_price_masters + land_price_yearly に保存
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const getDatabaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

/** 遅延初期化: handler呼び出し時に環境変数が確実に利用可能 */
let _sql: ReturnType<typeof neon> | null = null;
function getSQL() {
  if (!_sql) _sql = neon(getDatabaseUrl());
  return _sql;
}

const API_BASE_URL = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002';

/** 1回の実行で処理するタイル数の上限（Hobbyプランの10秒制限を考慮） */
const MAX_TILES_PER_RUN = 10;

/** APIズームレベル（13が最適: ~4km×4kmのタイルサイズ、APIはz=13-15をサポート） */
const ZOOM_LEVEL = 13;

/** 主要都市の代表座標（タイル生成用） */
const MAJOR_CITIES = [
  { name: '東京', lat: 35.6812, lon: 139.7671 },
  { name: '大阪', lat: 34.6937, lon: 135.5023 },
  { name: '名古屋', lat: 35.1815, lon: 136.9066 },
  { name: '横浜', lat: 35.4437, lon: 139.6380 },
  { name: '福岡', lat: 33.5904, lon: 130.4017 },
  { name: '札幌', lat: 43.0618, lon: 141.3545 },
  { name: '仙台', lat: 38.2682, lon: 140.8694 },
  { name: '広島', lat: 34.3853, lon: 132.4553 },
  { name: '京都', lat: 35.0116, lon: 135.7681 },
  { name: '神戸', lat: 34.6901, lon: 135.1956 },
];

interface LandPriceFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Cron認証（Vercelが自動的にAuthorization headerを付与）
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // フォールバック: APIキー認証も許可
    const authKey = req.query.key || req.headers['x-api-key'];
    if (authKey !== process.env.REINFOLIB_API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'REINFOLIB_API_KEY not configured' });
    return;
  }

  const currentYear = new Date().getFullYear() - 1;

  try {
    const sql = getSQL();

    // 未処理タイルをバッチ進捗テーブルから取得
    let pendingTiles = await sql`
      SELECT tile_z, tile_x, tile_y, year, price_classification
      FROM batch_progress
      WHERE status = 'pending'
      ORDER BY id
      LIMIT ${MAX_TILES_PER_RUN}
    `;

    // 未処理タイルがなければ新規タイルを生成
    if (pendingTiles.length === 0) {
      await generateBatchTiles(currentYear);
      pendingTiles = await sql`
        SELECT tile_z, tile_x, tile_y, year, price_classification
        FROM batch_progress
        WHERE status = 'pending'
        ORDER BY id
        LIMIT ${MAX_TILES_PER_RUN}
      `;
    }

    let processed = 0;
    let saved = 0;

    for (const tile of pendingTiles) {
      try {
        const params = new URLSearchParams({
          response_format: 'geojson',
          z: String(tile.tile_z),
          x: String(tile.tile_x),
          y: String(tile.tile_y),
          year: String(tile.year),
          priceClassification: String(tile.price_classification),
        });

        const response = await fetch(`${API_BASE_URL}?${params.toString()}`, {
          headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.features) {
            saved += await saveFeaturesToDB(
              data.features,
              tile.tile_z,
              tile.tile_x,
              tile.tile_y,
              tile.year,
              tile.price_classification
            );
          }
        }

        // 進捗を更新
        await sql`
          UPDATE batch_progress
          SET status = 'completed', processed_at = NOW()
          WHERE tile_z = ${tile.tile_z} AND tile_x = ${tile.tile_x}
            AND tile_y = ${tile.tile_y} AND year = ${tile.year}
            AND price_classification = ${tile.price_classification}
        `;
        processed++;
      } catch (err) {
        console.error('Error processing tile:', tile, err);
        await sql`
          UPDATE batch_progress
          SET status = 'error'
          WHERE tile_z = ${tile.tile_z} AND tile_x = ${tile.tile_x}
            AND tile_y = ${tile.tile_y} AND year = ${tile.year}
            AND price_classification = ${tile.price_classification}
        `;
      }
    }

    res.status(200).json({
      message: 'Batch update completed',
      processed,
      saved,
      remaining: pendingTiles.length - processed,
    });
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Batch update failed' });
  }
}

/**
 * APIレスポンスのfeaturesをDB（正規化テーブル）に保存
 * @returns 保存成功した件数
 */
async function saveFeaturesToDB(
  features: LandPriceFeature[],
  tileZ: number,
  tileX: number,
  tileY: number,
  year: number,
  classification: number
): Promise<number> {
  const sql = getSQL();
  let savedCount = 0;

  for (const feature of features) {
    const props = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    const pointId = (props.point_id as string) || `${lat}-${lon}`;

    // 価格を数値に変換
    let price: number | null = null;
    const priceStr = props.u_current_years_price_ja as string | undefined;
    if (priceStr) {
      const cleaned = priceStr.replace(/[^0-9]/g, '');
      if (cleaned) {
        price = parseInt(cleaned, 10);
        if (isNaN(price)) price = null;
      }
    }

    const changeRate = props.year_on_year_change_rate as number | null ?? null;

    try {
      // 1. マスターテーブルに UPSERT
      await sql`
        INSERT INTO land_price_masters (
          point_id, lat, lon, tile_z, tile_x, tile_y,
          price_classification, standard_lot_number, prefecture_name,
          city_name, address_display, place_name, properties, latest_year
        ) VALUES (
          ${pointId}, ${lat}, ${lon}, ${tileZ}, ${tileX}, ${tileY},
          ${classification},
          ${(props.standard_lot_number_ja as string) || null},
          ${(props.prefecture_name_ja as string) || null},
          ${((props.city_county_name_ja as string) || '') + ((props.ward_town_village_name_ja as string) || '')},
          ${(props.residence_display_name_ja as string) || null},
          ${(props.place_name_ja as string) || null},
          ${JSON.stringify(props)},
          ${year}
        )
        ON CONFLICT (point_id)
        DO UPDATE SET
          properties = CASE
            WHEN ${year} >= land_price_masters.latest_year
            THEN ${JSON.stringify(props)}::jsonb
            ELSE land_price_masters.properties
          END,
          latest_year = GREATEST(land_price_masters.latest_year, ${year}),
          updated_at = NOW()
      `;

      // 2. 年度別価格テーブルに UPSERT
      await sql`
        INSERT INTO land_price_yearly (point_id, year, price, change_rate)
        VALUES (${pointId}, ${year}, ${price}, ${changeRate})
        ON CONFLICT (point_id, year)
        DO UPDATE SET
          price = EXCLUDED.price,
          change_rate = EXCLUDED.change_rate
      `;

      savedCount++;
    } catch {
      // skip individual record errors
    }
  }

  return savedCount;
}

/**
 * 主要都市のタイルをバッチ進捗テーブルに追加
 */
async function generateBatchTiles(year: number): Promise<void> {
  const sql = getSQL();
  for (const city of MAJOR_CITIES) {
    const centerTile = latLonToTile(city.lat, city.lon, ZOOM_LEVEL);

    // 中心タイルとその周囲1タイル（3x3 = 9タイル）
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const classification of [0, 1]) {
          try {
            await sql`
              INSERT INTO batch_progress (tile_z, tile_x, tile_y, year, price_classification, status)
              VALUES (${ZOOM_LEVEL}, ${centerTile.x + dx}, ${centerTile.y + dy}, ${year}, ${classification}, 'pending')
              ON CONFLICT (tile_z, tile_x, tile_y, year, price_classification) DO NOTHING
            `;
          } catch {
            // skip duplicates
          }
        }
      }
    }
  }
}
