/**
 * Vercel Serverless Function - DBマイグレーション
 * テーブル作成・更新用エンドポイント（管理者のみ実行可能）
 *
 * 新テーブル構造:
 *   - land_price_masters: 地点マスター（地点ごとに1行）
 *   - land_price_yearly:  年度別価格（価格と変動率のみ）
 *   - batch_progress:     バッチ処理進捗
 *   - api_freshness_state: API鮮度管理（シングルトン）
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // 管理者認証（REINFOLIB_API_KEYを認証キーとして兼用）
  const authKey = req.query.key || req.headers['x-api-key'];
  const expectedKey = process.env.REINFOLIB_API_KEY;

  if (!expectedKey || authKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const sql = getSQL();

    // pg_trgmエクステンションを作成（トリグラム検索用）
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;

    // ──────────────────────────────────────────────
    // land_price_masters: 地点マスター（地点ごとに1行）
    // ──────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS land_price_masters (
        point_id TEXT PRIMARY KEY,
        lat DOUBLE PRECISION NOT NULL,
        lon DOUBLE PRECISION NOT NULL,
        tile_z INTEGER NOT NULL,
        tile_x INTEGER NOT NULL,
        tile_y INTEGER NOT NULL,
        price_classification INTEGER NOT NULL,
        standard_lot_number TEXT,
        prefecture_name TEXT,
        city_name TEXT,
        address_display TEXT,
        place_name TEXT,
        properties JSONB NOT NULL,
        latest_year INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // ──────────────────────────────────────────────
    // land_price_yearly: 年度別価格
    // ──────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS land_price_yearly (
        point_id TEXT NOT NULL REFERENCES land_price_masters(point_id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        price INTEGER,
        change_rate REAL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (point_id, year)
      );
    `;

    // ──────────────────────────────────────────────
    // batch_progress: バッチ処理進捗
    // ──────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS batch_progress (
        id SERIAL PRIMARY KEY,
        tile_z INTEGER NOT NULL,
        tile_x INTEGER NOT NULL,
        tile_y INTEGER NOT NULL,
        year INTEGER NOT NULL,
        price_classification INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        processed_at TIMESTAMP,
        UNIQUE(tile_z, tile_x, tile_y, year, price_classification)
      );
    `;

    // ──────────────────────────────────────────────
    // api_freshness_state: API鮮度管理（シングルトン）
    // ──────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS api_freshness_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        latest_year INTEGER NOT NULL DEFAULT 2025,
        probe_count INTEGER NOT NULL DEFAULT 0,
        probe_date DATE NOT NULL DEFAULT CURRENT_DATE,
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (id = 1)
      );
    `;

    // 初期行を挿入
    await sql`
      INSERT INTO api_freshness_state (id, latest_year, probe_count, probe_date)
      VALUES (1, 2025, 0, CURRENT_DATE)
      ON CONFLICT (id) DO NOTHING;
    `;

    // ──────────────────────────────────────────────
    // インデックス
    // ──────────────────────────────────────────────
    await sql`
      CREATE INDEX IF NOT EXISTS idx_masters_tile
        ON land_price_masters(tile_z, tile_x, tile_y, price_classification);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_masters_place_trgm
        ON land_price_masters USING gin(place_name gin_trgm_ops);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_masters_coords
        ON land_price_masters(lat, lon);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_yearly_point
        ON land_price_yearly(point_id, year DESC);
    `;

    // ──────────────────────────────────────────────
    // 旧テーブルからの自動マイグレーション
    // ──────────────────────────────────────────────
    const oldTableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'land_price_points'
      ) as exists;
    `;

    let migrated = false;
    if ((oldTableCheck as Record<string, any>[])[0].exists) {
      const oldCount = await sql`SELECT count(*) as cnt FROM land_price_points;` as Record<string, any>[];
      const count = parseInt(String(oldCount[0].cnt), 10);

      if (count > 0) {
        // マスターテーブルに最新年度の行を挿入
        await sql`
          INSERT INTO land_price_masters (
            point_id, lat, lon, tile_z, tile_x, tile_y,
            price_classification, standard_lot_number, prefecture_name,
            city_name, address_display, place_name, properties, latest_year
          )
          SELECT DISTINCT ON (point_id)
            point_id, lat, lon, tile_z, tile_x, tile_y,
            price_classification, standard_lot_number, prefecture_name,
            city_name, address_display, place_name, properties, year
          FROM land_price_points
          ORDER BY point_id, year DESC
          ON CONFLICT (point_id) DO NOTHING;
        `;

        // 年度別価格テーブルにデータを挿入
        await sql`
          INSERT INTO land_price_yearly (point_id, year, price, change_rate)
          SELECT
            point_id,
            year,
            CASE
              WHEN properties->>'u_current_years_price_ja' IS NOT NULL
              THEN NULLIF(REGEXP_REPLACE(properties->>'u_current_years_price_ja', '[^0-9]', '', 'g'), '')::INTEGER
              ELSE NULL
            END,
            (properties->>'year_on_year_change_rate')::REAL
          FROM land_price_points
          ON CONFLICT (point_id, year) DO NOTHING;
        `;

        // 旧テーブルをリネーム
        await sql`ALTER TABLE land_price_points RENAME TO land_price_points_old;`;
        migrated = true;
      } else {
        await sql`DROP TABLE land_price_points;`;
      }
    }

    res.status(200).json({
      message: 'Migration completed successfully',
      migrated,
      tables: ['land_price_masters', 'land_price_yearly', 'batch_progress', 'api_freshness_state'],
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', details: String(error) });
  }
}
