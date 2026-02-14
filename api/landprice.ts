/**
 * Vercel Serverless Function - 不動産情報ライブラリAPI Proxy（DB経由）
 *
 * データフロー:
 *   1. api_freshness_state のプローブ状態を確認
 *   2. 1日5回未満 → APIを直接叩き、レスポンスをクライアントに返却 + DBに保存
 *   3. 5回以上 → DB優先、なければAPIフォールバック
 *   4. APIレスポンスに最新年度のデータがあれば api_freshness_state を更新
 *
 * テーブル構造:
 *   - land_price_masters: 地点マスター（最新プロパティ）
 *   - land_price_yearly:  年度別価格
 *   - api_freshness_state: プローブ状態管理
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

/** 1日あたりのプローブ回数上限 */
const MAX_DAILY_PROBES = 5;

interface LandPriceFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

interface LandPriceApiResponse {
  type: 'FeatureCollection';
  features: LandPriceFeature[];
  latestYear?: number;
}

interface ProbeState {
  latestYear: number;
  probeCount: number;
}

// ──────────────────────────────────────────────
// プローブ状態管理
// ──────────────────────────────────────────────

/**
 * プローブ状態を取得（日付が変わっていたらカウントリセット）
 */
async function getProbeState(): Promise<ProbeState> {
  try {
    const sql = getSQL();
    const rows = await sql`SELECT * FROM api_freshness_state WHERE id = 1` as Record<string, any>[];

    if (rows.length === 0) {
      // 初期行がなければ作成
      await sql`
        INSERT INTO api_freshness_state (id, latest_year, probe_count, probe_date)
        VALUES (1, 2025, 0, CURRENT_DATE)
        ON CONFLICT (id) DO NOTHING
      `;
      return { latestYear: 2025, probeCount: 0 };
    }

    const row = rows[0];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const probeDate = row.probe_date instanceof Date
      ? row.probe_date.toISOString().split('T')[0]
      : String(row.probe_date);

    if (probeDate !== today) {
      // 日付が変わったのでプローブカウントをリセット
      await sql`
        UPDATE api_freshness_state
        SET probe_count = 0, probe_date = CURRENT_DATE, updated_at = NOW()
        WHERE id = 1
      `;
      return { latestYear: Number(row.latest_year), probeCount: 0 };
    }

    return { latestYear: Number(row.latest_year), probeCount: Number(row.probe_count) };
  } catch {
    // DB未接続時のフォールバック
    return { latestYear: new Date().getFullYear() - 1, probeCount: MAX_DAILY_PROBES };
  }
}

/**
 * プローブカウントをインクリメント
 */
async function incrementProbeCount(): Promise<void> {
  try {
    const sql = getSQL();
    await sql`
      UPDATE api_freshness_state
      SET probe_count = probe_count + 1, updated_at = NOW()
      WHERE id = 1
    `;
  } catch {
    // 失敗しても処理は続行
  }
}

/**
 * APIレスポンスから最新年度を検出し、必要に応じて更新
 */
async function detectAndUpdateLatestYear(
  features: LandPriceFeature[],
  currentLatestYear: number
): Promise<number> {
  // レスポンス内の最大 target_year を検出
  let maxYear = currentLatestYear;
  for (const feature of features) {
    const yearName = feature.properties.target_year_name_ja as string | undefined;
    if (yearName) {
      // "令和7年" → 2025, "令和8年" → 2026 等を西暦に変換
      const match = yearName.match(/令和(\d+)年/);
      if (match) {
        const reiwaYear = parseInt(match[1], 10);
        const westernYear = reiwaYear + 2018;
        if (westernYear > maxYear) {
          maxYear = westernYear;
        }
      }
    }
  }

  if (maxYear > currentLatestYear) {
    try {
      const sql = getSQL();
      await sql`
        UPDATE api_freshness_state
        SET latest_year = ${maxYear}, updated_at = NOW()
        WHERE id = 1
      `;
    } catch {
      // 更新失敗は無視
    }
  }

  return maxYear;
}

// ──────────────────────────────────────────────
// メインハンドラ
// ──────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CDNキャッシュヘッダー
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { z, x, y, year, priceClassification } = req.query;

  if (!z || !x || !y || !year) {
    res.status(400).json({ error: 'z, x, y, year parameters are required' });
    return;
  }

  const tileZ = Number(z);
  const tileX = Number(x);
  const tileY = Number(y);
  const yearNum = Number(year);
  const classification = priceClassification !== undefined && priceClassification !== ''
    ? Number(priceClassification)
    : undefined;

  try {
    // プローブ状態を取得
    const probeState = await getProbeState();
    const isProbe = probeState.probeCount < MAX_DAILY_PROBES;

    if (isProbe) {
      // ──────────────────────────────────
      // プローブモード: APIを直接叩く
      // ──────────────────────────────────
      await incrementProbeCount();

      const apiData = await fetchFromAPI(tileZ, tileX, tileY, yearNum, classification);

      if (apiData && apiData.features.length > 0) {
        // 最新年度を検出
        const detectedYear = await detectAndUpdateLatestYear(apiData.features, probeState.latestYear);

        // DBに保存（非同期、レスポンスをブロックしない）
        saveToDB(apiData.features, tileZ, tileX, tileY, yearNum, classification).catch((err) => {
          console.error('Failed to save to DB:', err);
        });

        // APIデータをそのままクライアントに返却 + latestYear を付与
        const response: LandPriceApiResponse = {
          ...apiData,
          latestYear: detectedYear,
        };
        res.status(200).json(response);
        return;
      }

      // APIが空の場合もlatestYearを返す
      res.status(200).json({
        type: 'FeatureCollection',
        features: [],
        latestYear: probeState.latestYear,
      });
      return;
    }

    // ──────────────────────────────────
    // 通常モード: DB優先
    // ──────────────────────────────────
    const dbData = await fetchFromDB(tileZ, tileX, tileY, yearNum, classification);
    if (dbData && dbData.features.length > 0) {
      dbData.latestYear = probeState.latestYear;
      res.status(200).json(dbData);
      return;
    }

    // DBにデータがなければAPIからフェッチ
    const apiData = await fetchFromAPI(tileZ, tileX, tileY, yearNum, classification);
    if (!apiData) {
      res.status(200).json({
        type: 'FeatureCollection',
        features: [],
        latestYear: probeState.latestYear,
      });
      return;
    }

    // APIから取得したデータをDBに保存（非同期）
    saveToDB(apiData.features, tileZ, tileX, tileY, yearNum, classification).catch((err) => {
      console.error('Failed to save to DB:', err);
    });

    res.status(200).json({
      ...apiData,
      latestYear: probeState.latestYear,
    });
  } catch (error) {
    console.error('Land Price API error:', error);

    // DB接続エラーの場合はAPIに直接フォールバック
    try {
      const apiData = await fetchFromAPI(tileZ, tileX, tileY, yearNum, classification);
      res.status(200).json(apiData || { type: 'FeatureCollection', features: [] });
    } catch (apiError) {
      console.error('API fallback also failed:', apiError);
      res.status(500).json({ error: 'Failed to fetch land price data' });
    }
  }
}

// ──────────────────────────────────────────────
// DBからデータを取得（正規化テーブル対応）
// ──────────────────────────────────────────────

async function fetchFromDB(
  tileZ: number,
  tileX: number,
  tileY: number,
  year: number,
  classification?: number
): Promise<LandPriceApiResponse | null> {
  try {
    const sql = getSQL();

    // mastersテーブルからタイル範囲のポイントを取得し、
    // yearlyテーブルから該当年度の価格を取得
    let rows: Record<string, any>[];

    if (classification !== undefined) {
      rows = await sql`
        SELECT
          m.properties, m.lat, m.lon, m.point_id,
          y.price, y.change_rate
        FROM land_price_masters m
        LEFT JOIN land_price_yearly y ON m.point_id = y.point_id AND y.year = ${year}
        WHERE m.tile_z = ${tileZ} AND m.tile_x = ${tileX} AND m.tile_y = ${tileY}
          AND m.price_classification = ${classification}
      ` as Record<string, any>[];
    } else {
      rows = await sql`
        SELECT
          m.properties, m.lat, m.lon, m.point_id,
          y.price, y.change_rate
        FROM land_price_masters m
        LEFT JOIN land_price_yearly y ON m.point_id = y.point_id AND y.year = ${year}
        WHERE m.tile_z = ${tileZ} AND m.tile_x = ${tileX} AND m.tile_y = ${tileY}
      ` as Record<string, any>[];
    }

    if (rows.length === 0) {
      return null;
    }

    // yearlyに該当年度のデータがない行は除外
    const featuresWithData = rows.filter((row: Record<string, any>) => row.price !== null);
    if (featuresWithData.length === 0) {
      return null;
    }

    const features: LandPriceFeature[] = featuresWithData.map((row) => {
      const props = row.properties as Record<string, unknown>;
      // yearlyの価格データでプロパティを上書き（表示用）
      if (row.price !== null) {
        props.u_current_years_price_ja = Number(row.price).toLocaleString();
      }
      if (row.change_rate !== null) {
        props.year_on_year_change_rate = row.change_rate;
      }
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [row.lon, row.lat] as [number, number],
        },
        properties: props,
      };
    });

    return { type: 'FeatureCollection', features };
  } catch {
    // DB接続エラー
    return null;
  }
}

// ──────────────────────────────────────────────
// APIからデータを取得
// ──────────────────────────────────────────────

async function fetchFromAPI(
  tileZ: number,
  tileX: number,
  tileY: number,
  year: number,
  classification?: number
): Promise<LandPriceApiResponse | null> {
  const apiKey = process.env.REINFOLIB_API_KEY;

  if (!apiKey) {
    console.error('REINFOLIB_API_KEY is not set');
    return null;
  }

  const params = new URLSearchParams({
    response_format: 'geojson',
    z: String(tileZ),
    x: String(tileX),
    y: String(tileY),
    year: String(year),
  });

  if (classification !== undefined) {
    params.append('priceClassification', String(classification));
  }

  const url = `${API_BASE_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      console.error('Invalid API key');
      return null;
    }
    throw new Error(`API responded with status: ${response.status}`);
  }

  return await response.json();
}

// ──────────────────────────────────────────────
// DBにデータを保存（正規化テーブル対応）
// ──────────────────────────────────────────────

async function saveToDB(
  features: LandPriceFeature[],
  tileZ: number,
  tileX: number,
  tileY: number,
  year: number,
  classification?: number
): Promise<void> {
  const sql = getSQL();

  for (const feature of features) {
    const props = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    const pointId = (props.point_id as string) || `${lat}-${lon}`;
    const priceClassification = classification ?? (props.land_price_type as number) ?? 0;

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
      //    新しい年度のデータが来たらプロパティを上書き
      await sql`
        INSERT INTO land_price_masters (
          point_id, lat, lon, tile_z, tile_x, tile_y,
          price_classification, standard_lot_number, prefecture_name,
          city_name, address_display, place_name, properties, latest_year
        ) VALUES (
          ${pointId}, ${lat}, ${lon}, ${tileZ}, ${tileX}, ${tileY},
          ${priceClassification},
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
    } catch (err) {
      // 個別レコードのエラーは無視して続行
      console.error('Failed to save point:', pointId, err);
    }
  }
}
